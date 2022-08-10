// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

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

    // It is a fee to be paid for the validator that participates
    // in a voting, which is a voter. Its unit is cent of BOA.
    uint256 voter_fee;

    // The max count of validators that CommonsBudget can distribute
    // vote fess to in an attempt of distribution.
    uint256 public vote_fee_distrib_count;

    constructor() {
        fund_proposal_fee_permil = 10;
        system_proposal_fee = 100000000000000000000;
        vote_quorum_factor = 333333; // Number of validators / 3
        voter_fee = 200000000000000;
        vote_fee_distrib_count = 100;
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

    function setVoterFee(uint256 _value) public onlyOwner {
        voter_fee = _value;
    }

    function getVoterFee() public view returns (uint256) {
        return voter_fee;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == this.supportsInterface.selector ||
            interfaceId ==
            this.createSystemProposal.selector ^
                this.createFundProposal.selector ^
                this.finishVote.selector ^
                this.distributeVoteFees.selector;
    }

    /// @notice vote manager is votera vote server
    /// @return returns address of vote manager
    address public voteManager;
    /// @notice vote address is votera vote contract
    /// @return returns address of vote contract
    address public voteAddress;

    enum ProposalType {
        SYSTEM,
        FUND
    }

    enum ProposalStates {
        INVALID, // Not exist data
        CREATED, // Created
        FINISHED // The Vote contract has already notified this contract that the vote has ended
    }

    struct ProposalFeeData {
        address payer;
        uint256 value;
        mapping(address => bool) voteFeePaid;
    }

    struct ProposalData {
        ProposalStates state;
        ProposalType proposalType;
        address proposer;
        string title;
        uint64 start;
        uint64 end;
        uint64 startAssess;
        uint64 endAssess;
        bytes32 docHash;
        uint256 fundAmount;
        uint256 validatorSize;
        uint64[] voteResult;
        address voteAddress;
    }

    mapping(bytes32 => ProposalFeeData) private feeMaps;
    mapping(bytes32 => ProposalData) private proposalMaps;

    modifier onlyInvalidProposal(bytes32 _proposalID) {
        require(proposalMaps[_proposalID].state == ProposalStates.INVALID, "AlreadyExistProposal");
        _;
    }

    modifier onlyValidProposal(bytes32 _proposalID) {
        require(proposalMaps[_proposalID].state != ProposalStates.INVALID, "NotFoundProposal");
        _;
    }

    modifier onlyNotFinishedProposal(bytes32 _proposalID) {
        require(proposalMaps[_proposalID].state != ProposalStates.INVALID, "NotExistProposal");
        require(proposalMaps[_proposalID].state != ProposalStates.FINISHED, "AlreadyFinishedProposal");
        require(proposalMaps[_proposalID].state == ProposalStates.CREATED, "InvalidState");
        _;
    }

    modifier onlyEndProposal(bytes32 _proposalID) {
        require(block.timestamp >= proposalMaps[_proposalID].end, "NotEndProposal");
        _;
    }

    modifier onlyVoteContract(bytes32 _proposalID) {
        require(msg.sender == proposalMaps[_proposalID].voteAddress, "NotAuthorized");
        _;
    }

    modifier onlyVoteManager() {
        require(voteManager == msg.sender, "NotAuthorized");
        _;
    }

    /// @notice change votera vote system parameter
    /// @param _voteManager address of voteManager
    /// @param _voteAddress address of voteraVote contract
    function changeVoteParam(address _voteManager, address _voteAddress) public onlyOwner {
        require(_voteManager != address(0) && _voteAddress != address(0), "InvalidInput");
        voteManager = _voteManager;
        voteAddress = _voteAddress;
    }

    function initVote(
        bytes32 _proposalID,
        ProposalType _proposalType,
        uint64 _start,
        uint64 _end,
        uint64 _startAssess,
        uint64 _endAssess
    ) internal returns (address) {
        require(voteAddress != address(0) && voteManager != address(0), "NotReady");
        IVoteraVote(voteAddress).init(
            _proposalID,
            _proposalType == ProposalType.SYSTEM ? VoteType.SYSTEM : VoteType.FUND,
            _start,
            _end,
            _startAssess,
            _endAssess
        );
        return voteAddress;
    }

    function saveProposalData(
        ProposalType _proposalType,
        bytes32 _proposalID,
        ProposalInput calldata _proposalInput
    ) private {
        proposalMaps[_proposalID].state = ProposalStates.CREATED;
        proposalMaps[_proposalID].proposalType = _proposalType;
        proposalMaps[_proposalID].title = _proposalInput.title;
        proposalMaps[_proposalID].start = _proposalInput.start;
        proposalMaps[_proposalID].end = _proposalInput.end;
        proposalMaps[_proposalID].startAssess = _proposalInput.startAssess;
        proposalMaps[_proposalID].endAssess = _proposalInput.endAssess;
        proposalMaps[_proposalID].docHash = _proposalInput.docHash;
        proposalMaps[_proposalID].fundAmount = _proposalInput.amount;
        proposalMaps[_proposalID].proposer = msg.sender;

        feeMaps[_proposalID].value = msg.value;
        feeMaps[_proposalID].payer = msg.sender;

        proposalMaps[_proposalID].voteAddress = initVote(
            _proposalID,
            _proposalType,
            _proposalInput.start,
            _proposalInput.end,
            _proposalInput.startAssess,
            _proposalInput.endAssess
        );
    }

    /// @notice create system proposal
    /// @param _proposalID id of proposal
    /// @param _proposalInput input data of proposal
    /// @param _signature signature data from vote manager of proposal
    function createSystemProposal(
        bytes32 _proposalID,
        ProposalInput calldata _proposalInput,
        bytes calldata _signature
    ) external payable override onlyInvalidProposal(_proposalID) {
        require(msg.value >= system_proposal_fee, "InvalidFee");
        require(block.timestamp < _proposalInput.start && _proposalInput.start < _proposalInput.end, "InvalidInput");

        bytes32 dataHash = keccak256(
            abi.encode(
                _proposalID,
                _proposalInput.title,
                _proposalInput.start,
                _proposalInput.end,
                _proposalInput.docHash
            )
        );
        require(ECDSA.recover(dataHash, _signature) == voteManager, "InvalidInput");

        saveProposalData(ProposalType.SYSTEM, _proposalID, _proposalInput);
    }

    /// @notice create fund proposal
    /// @param _proposalID id of proposal
    /// @param _proposalInput input data of proposal
    /// @param _signature signature data from vote manager of proposal
    function createFundProposal(
        bytes32 _proposalID,
        ProposalInput calldata _proposalInput,
        bytes calldata _signature
    ) external payable override onlyInvalidProposal(_proposalID) {
        uint256 _appropriateFee = (_proposalInput.amount * fund_proposal_fee_permil) / 1000;
        require(msg.value >= _appropriateFee, "InvalidFee");
        require(address(this).balance >= _proposalInput.amount, "NotEnoughBudget");
        require(
            block.timestamp < _proposalInput.endAssess &&
                _proposalInput.startAssess < _proposalInput.endAssess &&
                _proposalInput.endAssess < _proposalInput.start &&
                _proposalInput.start < _proposalInput.end,
            "InvalidInput"
        );

        bytes32 dataHash = keccak256(
            abi.encode(
                _proposalID,
                _proposalInput.title,
                _proposalInput.start,
                _proposalInput.end,
                _proposalInput.startAssess,
                _proposalInput.endAssess,
                _proposalInput.docHash,
                _proposalInput.amount,
                msg.sender
            )
        );
        require(ECDSA.recover(dataHash, _signature) == voteManager, "InvalidInput");

        saveProposalData(ProposalType.FUND, _proposalID, _proposalInput);
    }

    /// @notice notify that vote is finished
    /// @dev this is called by vote manager
    /// @param _proposalID id of proposal
    /// @param _validatorSize size of valid validator of proposal's vote
    /// @param _voteResult result of proposal's vote
    function finishVote(
        bytes32 _proposalID,
        uint256 _validatorSize,
        uint64[] calldata _voteResult
    )
        external
        override
        onlyNotFinishedProposal(_proposalID)
        onlyEndProposal(_proposalID)
        onlyVoteContract(_proposalID)
    {
        address _voteAddress = proposalMaps[_proposalID].voteAddress;
        IVoteraVote voteraVote = IVoteraVote(_voteAddress);

        require(voteManager == voteraVote.getManager(), "InvalidVote");
        require(_validatorSize == voteraVote.getValidatorCount(_proposalID), "InvalidInput");

        uint64[] memory voteResult = voteraVote.getVoteResult(_proposalID);
        require(voteResult.length == _voteResult.length, "InvalidInput");
        for (uint256 i = 0; i < voteResult.length; i++) {
            require(voteResult[i] == _voteResult[i], "InvalidInput");
        }

        proposalMaps[_proposalID].state = ProposalStates.FINISHED;
        proposalMaps[_proposalID].validatorSize = _validatorSize;
        proposalMaps[_proposalID].voteResult = _voteResult;
    }

    /// @notice check if the distribution is available
    /// @param _proposalID id of proposal
    function canDistributeVoteFees(bytes32 _proposalID) public view returns (bool) {
        address _voteAddress = proposalMaps[_proposalID].voteAddress;
        IVoteraVote voteraVote = IVoteraVote(_voteAddress);
        if (voteraVote.isValidatorListFinalized(_proposalID)) {
            return true;
        } else {
            return false;
        }
    }

    /// @notice distribute the vote fees to validators
    /// @param _proposalID id of proposal
    /// @param _start the start index of validators that
    ///     is to receive a vote fee.
    function distributeVoteFees(bytes32 _proposalID, uint256 _start) external override onlyOwner {
        require(canDistributeVoteFees(_proposalID));

        address _voteAddress = proposalMaps[_proposalID].voteAddress;
        IVoteraVote voteraVote = IVoteraVote(_voteAddress);
        uint256 validatorLength = voteraVote.getValidatorCount(_proposalID);
        require(_start < validatorLength, "InvalidInput");
        for (uint256 i = _start; i < validatorLength && i < _start + vote_fee_distrib_count; i++) {
            address validator = voteraVote.getValidatorAt(_proposalID, i);
            if (!feeMaps[_proposalID].voteFeePaid[validator]) {
                feeMaps[_proposalID].voteFeePaid[validator] = true;
                payable(validator).transfer(voter_fee);
            }
        }
    }

    /// @notice get fees to be paid for the proposal
    /// @param _proposalID id of proposal
    /// @return returns fee values to be paid for the proposal
    function getProposalValues(bytes32 _proposalID) public view returns (uint256) {
        return feeMaps[_proposalID].value;
    }

    /// @notice get proposal data
    /// @param _proposalID id of proposal
    /// @return returns proposal data
    function getProposalData(bytes32 _proposalID) public view returns (ProposalData memory) {
        return proposalMaps[_proposalID];
    }
}
