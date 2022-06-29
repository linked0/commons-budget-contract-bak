// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import "./IVoteraVote.sol";
import "./ICommonsBudget.sol";

contract CommonsBudget is Ownable, IERC165, ICommonsBudget {
    event Received(address, uint256);

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    // It is a fee for the funding proposal. This is not a unit of BOA.
    // This is a thousand percent.
    // Proposal Fee = Funding amount * fund_proposal_fee_permil / 1000
    uint32 fund_proposal_fee_permil;

    // It is a fee for system proposals. Its unit is cent of BOA.
    uint256 system_proposal_fee;

    // Factor required to calculate a valid quorum
    // Quorum = Number of validators * vote_quorum_permil / 1000000
    uint32 vote_quorum_factor;

    constructor() {
        fund_proposal_fee_permil = 10;
        system_proposal_fee = 100000000000000000000;
        vote_quorum_factor = 333333; // Number of validators / 3
    }

    // Proposal Fee = Funding amount * _value / 1000
    function setFundProposalFeePermil(uint32 _value) public onlyOwner {
        fund_proposal_fee_permil = _value;
    }

    function getFundProposalFeePermil() public view returns (uint32) {
        return fund_proposal_fee_permil;
    }

    // Its unit is cent of BOA.
    function setSystemProposalFee(uint256 _value) public onlyOwner {
        system_proposal_fee = _value;
    }

    function getSystemProposalFee() public view returns (uint256) {
        return system_proposal_fee;
    }

    // Proposal Fee = Number of validators * _value / 1000000
    function setVoteQuorumFactor(uint32 _value) public onlyOwner {
        vote_quorum_factor = _value;
    }

    function getVoteQuorumFactor() public view returns (uint32) {
        return vote_quorum_factor;
    }

    function supportsInterface(bytes4 interfaceId) external override view returns (bool) {
        return interfaceId == this.supportsInterface.selector ||
            interfaceId == this.makeSystemProposalData.selector ^ this.makeFundProposalData.selector ^ this.votePublished.selector ^ this.voteStarted.selector ^ this.rejectAssess.selector;
    }

    address public voteChair;
    address public voteAddress;

    enum ProposalType { SYSTEM, FUND }
    enum RejectedCause { NONE, SCORE, FEE }

    struct ProposalFeeData {
        address[] payers;
        mapping(address => uint) values;
    }

    struct ProposalData {
        ProposalType proposalType;

        string      title;
        uint64      start;
        uint64      end;
        bytes32     docHash;
        uint        fundAmount;
        address     proposer;

        bool        rejected; // FUND type: assess rejected
        RejectedCause cause;

        uint        validatorSize;
        uint64[]    voteCounts;

        address     voteAddress;
    }

    mapping(bytes32 => ProposalFeeData) private feeMaps;
    mapping(bytes32 => ProposalData) private proposalMaps;

    function changeVoteParam(address _voteChair, address _voteAddress) public onlyOwner {
        require(_voteChair != address(0) && _voteAddress != address(0), "InvalidInput");
        voteChair = _voteChair;
        voteAddress = _voteAddress;
    }

    function initVote(bytes32 _proposalID) internal returns (address) {
        require(voteAddress != address(0) && voteChair != address(0), "NotReady");
        IVoteraVote(voteAddress).init(_proposalID);
        return voteAddress;
    }

    function proposalExists(bytes32 _proposalID) private view returns (bool) {
        return proposalMaps[_proposalID].voteAddress != address(0);
    }

    function payProposalFee(bytes32 _proposalID) public payable {
        require(msg.value > 0, "InvalidFee");
        require(proposalExists(_proposalID), "NotFoundProposal");

        if (feeMaps[_proposalID].values[msg.sender] > 0) {
            feeMaps[_proposalID].values[msg.sender] += msg.value;
        } else {
            feeMaps[_proposalID].values[msg.sender] = msg.value;
            feeMaps[_proposalID].payers.push(msg.sender);
        }
    }

    function saveProposalData(ProposalType _proposalType, bytes32 _proposalID, string calldata _title, uint64 _start, uint64 _end, bytes32 _docHash) private {
        proposalMaps[_proposalID].proposalType = _proposalType;
        proposalMaps[_proposalID].title = _title;
        proposalMaps[_proposalID].start = _start;
        proposalMaps[_proposalID].end = _end;
        proposalMaps[_proposalID].docHash = _docHash;
        proposalMaps[_proposalID].voteAddress = initVote(_proposalID);

        feeMaps[_proposalID].values[msg.sender] = msg.value;
        feeMaps[_proposalID].payers.push(msg.sender);
    }

    function makeSystemProposalData(bytes32 _proposalID, string calldata _title, uint64 _start, uint64 _end, bytes32 _docHash) external override payable {
        require(msg.value > 0, "InvalidFee");
        require(!proposalExists(_proposalID), "DuplicatedProposal");
        require(block.timestamp < _start && _start < _end, "InvalidInput");
        // TODO: add policy for system proposal fee

        saveProposalData(ProposalType.SYSTEM, _proposalID, _title, _start, _end, _docHash);
    }

    function makeFundProposalData(bytes32 _proposalID, string calldata _title, uint64 _start, uint64 _end, bytes32 _docHash, uint _amount, address _proposer) external override payable {
        require(msg.value > 0 && msg.sender == _proposer, "InvalidFee"); // TODO: check proposer policy
        require(!proposalExists(_proposalID), "DuplicatedProposal");
        require(block.timestamp < _start && _start < _end, "InvalidInput");
        // TODO: add policy for fund proposal fee

        saveProposalData(ProposalType.FUND, _proposalID, _title, _start, _end, _docHash);

        proposalMaps[_proposalID].fundAmount = _amount;
        proposalMaps[_proposalID].proposer = _proposer;
    }

    // Called by VoteraVote chair
    function votePublished(bytes32 _proposalID, uint _validatorSize, uint64[] calldata _voteCounts) external override {
        address _voteAddress = proposalMaps[_proposalID].voteAddress;
        require(_voteAddress != address(0), "NotFoundProposal");
        
        require(block.timestamp >= proposalMaps[_proposalID].end, "NotEnd");
        require(!proposalMaps[_proposalID].rejected, "RejectedProposal");

        IVoteraVote voteraVote = IVoteraVote(_voteAddress);

        // call by contract will be failed by lack of fee, contract won't have value 
        require(msg.sender == voteraVote.getChair(), "NotAuthorized");
        require(_validatorSize == voteraVote.getValidatorCount(_proposalID), "InvalidInput");

        uint64[] memory voteCounts = voteraVote.getVoteCounts(_proposalID);
        require(voteCounts.length == _voteCounts.length, "InvalidInput");
        for (uint i = 0; i < voteCounts.length; i++) {
            require(voteCounts[i] == _voteCounts[i], "InvalidInput");
        }

        proposalMaps[_proposalID].validatorSize = _validatorSize;
        proposalMaps[_proposalID].voteCounts = _voteCounts;
    }

    // Called by VoteraVote chair
    function rejectAssess(bytes32 _proposalID) external override {
        address _voteAddress = proposalMaps[_proposalID].voteAddress;
        require(_voteAddress != address(0), "NotFoundProposal");

        require(proposalMaps[_proposalID].proposalType == ProposalType.FUND, "NotFundProposal");
        require(block.timestamp < proposalMaps[_proposalID].start, "Delayed");
        require(!proposalMaps[_proposalID].rejected, "RejectedProposal");

        IVoteraVote voteraVote = IVoteraVote(_voteAddress);
        require(msg.sender == voteraVote.getChair(), "NotAuthorized");

        proposalMaps[_proposalID].rejected = true;
        proposalMaps[_proposalID].cause = RejectedCause.SCORE;
    }

    // Called by VoteraVote chair
    function voteStarted(bytes32 _proposalID) external override {
        address _voteAddress = proposalMaps[_proposalID].voteAddress;
        require(_voteAddress != address(0), "NotFoundProposal");

        require(block.timestamp >= proposalMaps[_proposalID].start, "TooEarly");
        require(!proposalMaps[_proposalID].rejected, "RejectedProposal");

        IVoteraVote voteraVote = IVoteraVote(_voteAddress);
        require(msg.sender == voteraVote.getChair(), "NotAuthorized");

        if (proposalMaps[_proposalID].proposalType == ProposalType.FUND) {
            // TODO: policy for proposal fee
            uint required = proposalMaps[_proposalID].fundAmount / 10;
            uint values = getProposalValues(_proposalID);
            if (values < required) {
                // TODO: example of reject
                // proposalMaps[proposalID].rejected = true;
                proposalMaps[_proposalID].cause = RejectedCause.FEE;
                // revert("NotEnoughFee");
            }
        }
    }

    function getProposalValues(bytes32 _proposalID) public view returns (uint) {
        uint value = 0;
        uint len = feeMaps[_proposalID].payers.length;
        for (uint i = 0; i < len; ++i) {
            address _payer = feeMaps[_proposalID].payers[i];
            value += feeMaps[_proposalID].values[_payer];
        }
        return value;
    }

    function getProposalData(bytes32 _proposalID) public view returns (ProposalData memory) {
        return proposalMaps[_proposalID];
    }
}
