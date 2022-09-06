// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "./IVoteraVote.sol";
import "./ICommonsBudget.sol";
import "./CommonsStorage.sol";

// The code about whether the fund can be withdrawn
// "W00" : The fund can be withdrawn
// "W01" : There's no proposal for the proposal ID
// "W02" : The proposal is not a fund proposal
// "W03" : The assessment failed
// "W04" : The vote counting is not yet complete
// "W05" : The requester of the funding is not the proposer
// "W06" : The proposal has come to invalid or been rejected
// "W07" : 24 hours has not passed after the voting finished
// "W08" : The withdrawal of the funds was refused
// "W09" : The funds is already withdrawn

contract CommonsBudget is Ownable, IERC165, ICommonsBudget {
    event Received(address, uint256);

    CommonsStorage storageContract;

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    constructor() {
        storageContract = new CommonsStorage(msg.sender, address(this));
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == this.supportsInterface.selector ||
            interfaceId ==
            this.createSystemProposal.selector ^
                this.createFundProposal.selector ^
                this.assessProposal.selector ^
                this.finishVote.selector ^
                this.distributeVoteFees.selector ^
                this.withdraw.selector;
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
        REJECTED, // proposal rejected by assessment before vote
        ACCEPTED, // proposal accepted by assessment before vote
        FINISHED // Vote Finished
    }

    // The result of the proposal
    enum ProposalResult {
        NONE, // Not yet decided
        APPROVED, // Approved with sufficient positive votes
        REJECTED, // Rejected with insufficient positive votes
        INVALID_QUORUM, // Invalid due to the lack of the number sufficient for a quorum
        ASSESSMENT_FAILED // Not passed for the assessment
    }

    struct ProposalFeeData {
        address payer;
        uint256 value;
        mapping(address => bool) voteFeePaid;
    }

    struct ProposalData {
        ProposalStates state;
        ProposalType proposalType;
        ProposalResult proposalResult;
        address proposer;
        string title;
        uint256 countingFinishTime;
        bool fundWithdrawn;
        uint64 start;
        uint64 end;
        uint64 startAssess;
        uint64 endAssess;
        bytes32 docHash;
        uint256 fundAmount;
        uint256 assessParticipantSize;
        uint64[] assessData;
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
        require(proposalMaps[_proposalID].state != ProposalStates.INVALID, "NotFoundProposal");
        require(proposalMaps[_proposalID].state != ProposalStates.FINISHED, "AlreadyFinishedProposal");
        if (proposalMaps[_proposalID].proposalType == ProposalType.FUND) {
            require(proposalMaps[_proposalID].state != ProposalStates.REJECTED, "RejectedProposal");
            require(proposalMaps[_proposalID].state == ProposalStates.ACCEPTED, "NoAssessment");
        } else {
            require(proposalMaps[_proposalID].state == ProposalStates.CREATED, "InvalidState");
        }
        _;
    }

    modifier onlyNotAssessedFundProposal(bytes32 _proposalID) {
        require(proposalMaps[_proposalID].state != ProposalStates.INVALID, "NotFoundProposal");
        require(proposalMaps[_proposalID].proposalType == ProposalType.FUND, "InvalidProposal");
        require(proposalMaps[_proposalID].state == ProposalStates.CREATED, "AlreadyFinishedAssessment");
        require(block.timestamp >= proposalMaps[_proposalID].endAssess, "DuringAssessment");
        _;
    }

    modifier onlyBeforeVoteStart(bytes32 _proposalID) {
        require(block.timestamp < proposalMaps[_proposalID].start, "TooLate");
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

    function getStorageContractAddress() external view returns (address contractAddress) {
        return address(storageContract);
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
            _proposalType == ProposalType.FUND ? true : false,
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
        require(msg.value >= storageContract.system_proposal_fee(), "InvalidFee");
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
        uint256 _appropriateFee = (_proposalInput.amount * storageContract.fund_proposal_fee_permil()) / 1000;
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

    /// @notice save assess result of proposal
    /// @dev this is called by vote contract
    /// @param _proposalID id of proposal
    /// @param _validatorSize size of valid validator of proposal
    /// @param _assessParticipantSize size of assess participant
    /// @param _assessData result of assess
    function assessProposal(
        bytes32 _proposalID,
        uint256 _validatorSize,
        uint256 _assessParticipantSize,
        uint64[] calldata _assessData
    )
        external
        override
        onlyNotAssessedFundProposal(_proposalID)
        onlyBeforeVoteStart(_proposalID)
        onlyVoteContract(_proposalID)
    {
        proposalMaps[_proposalID].validatorSize = _validatorSize;
        proposalMaps[_proposalID].assessParticipantSize = _assessParticipantSize;
        proposalMaps[_proposalID].assessData = _assessData;

        if (_assessParticipantSize > 0) {
            uint256 minPass = 5 * _assessParticipantSize; // average 5 each
            uint256 sum = 0;
            for (uint256 j = 0; j < _assessData.length; j++) {
                if (_assessData[j] < minPass) {
                    proposalMaps[_proposalID].state = ProposalStates.REJECTED;
                    return;
                }
                sum += _assessData[j];
            }
            // check total average 7 above
            minPass = _assessData.length * 7 * _assessParticipantSize;
            if (sum < minPass) {
                proposalMaps[_proposalID].state = ProposalStates.REJECTED;
                return;
            }

            proposalMaps[_proposalID].state = ProposalStates.ACCEPTED;
        } else {
            proposalMaps[_proposalID].state = ProposalStates.REJECTED;
        }
    }

    /// @notice notify that vote is finished
    /// @dev this is called by vote contract
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
        uint256 voteCount = 0;
        for (uint256 i = 0; i < voteResult.length; i++) {
            require(voteResult[i] == _voteResult[i], "InvalidInput");
            voteCount += voteResult[i];
        }

        proposalMaps[_proposalID].countingFinishTime = block.timestamp;
        proposalMaps[_proposalID].state = ProposalStates.FINISHED;
        proposalMaps[_proposalID].validatorSize = _validatorSize;
        proposalMaps[_proposalID].voteResult = _voteResult;

        // Check if it has sufficient number of quorum member
        if (voteCount < (_validatorSize * storageContract.vote_quorum_factor()) / 1000000) {
            proposalMaps[_proposalID].proposalResult = ProposalResult.INVALID_QUORUM;
        }
        // Check if it has sufficient number of positive votes
        else if (
            voteResult[1] <= voteResult[2] ||
            ((voteResult[1] - voteResult[2]) * 100) / voteCount < storageContract.approval_diff_percent()
        ) {
            proposalMaps[_proposalID].proposalResult = ProposalResult.REJECTED;
        } else {
            proposalMaps[_proposalID].proposalResult = ProposalResult.APPROVED;
        }
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
        for (uint256 i = _start; i < validatorLength && i < _start + storageContract.vote_fee_distrib_count(); i++) {
            address validator = voteraVote.getValidatorAt(_proposalID, i);
            if (!feeMaps[_proposalID].voteFeePaid[validator]) {
                feeMaps[_proposalID].voteFeePaid[validator] = true;
                payable(validator).transfer(storageContract.voter_fee());
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

    /// @notice withdraw the funds of the proposal
    /// @param _proposalID id of proposal
    function withdraw(bytes32 _proposalID) external override {
        string memory stateCode;
        // TODO: This part should be restored after solving the issue about contract size limit
        //        if (proposalMaps[_proposalID].state == ProposalStates.INVALID) {
        //            stateCode = "W01";
        //        }
        if (proposalMaps[_proposalID].proposalType == ProposalType.SYSTEM) {
            stateCode = "W02";
        }
        // TODO: This part should be restored after solving the issue about contract size limit
        //        else if (proposalMaps[_proposalID].state == ProposalStates.REJECTED) {
        //            stateCode = "W03";
        //        }
        //        else if (proposalMaps[_proposalID].state < ProposalStates.FINISHED) {
        //            stateCode = "W04";
        //        }
        else if (msg.sender != proposalMaps[_proposalID].proposer) {
            stateCode = "W05";
        } else if (proposalMaps[_proposalID].proposalResult != ProposalResult.APPROVED) {
            stateCode = "W06";
        } else if (block.timestamp - proposalMaps[_proposalID].countingFinishTime < 86400) {
            stateCode = "W07";
        } else if (proposalMaps[_proposalID].fundWithdrawn == true) {
            stateCode = "W09";
        } else {
            stateCode = "W00";
        }

        require(keccak256(bytes(stateCode)) == keccak256(bytes("W00")), stateCode);
        proposalMaps[_proposalID].fundWithdrawn = true;
        payable(msg.sender).transfer(proposalMaps[_proposalID].fundAmount);
    }
}
