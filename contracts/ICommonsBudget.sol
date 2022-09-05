// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ICommonsBudget {
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

    enum ProposalType {
        SYSTEM,
        FUND
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

    struct ProposalInput {
        uint64 start; // vote starting time (seconds since the epoch)
        uint64 end; // vote ending time (seconds since the epoch)
        uint64 startAssess; // assessment starting time for fund proposal (seconds since the epoch)
        uint64 endAssess; // assessment ending time for fund proposal (seconds since the epoch)
        uint256 amount; // requesting fund amount
        bytes32 docHash; // hash data of proposal description and attachment
        string title; // title of proposal
    }

    /// @notice create system proposal
    /// @param proposalID id of proposal
    /// @param proposalInput input data of proposal
    /// @param signature signature data from vote manager of proposal
    function createSystemProposal(
        bytes32 proposalID,
        ProposalInput calldata proposalInput,
        bytes calldata signature
    ) external payable;

    /// @notice create fund proposal
    /// @param proposalID id of proposal
    /// @param proposalInput input data of proposal
    /// @param signature signature data from vote manager of proposal
    function createFundProposal(
        bytes32 proposalID,
        ProposalInput calldata proposalInput,
        bytes calldata signature
    ) external payable;

    /// @notice save assess result of proposal
    /// @dev this is called by vote contract
    /// @param proposalID id of proposal
    /// @param validatorSize size of valid validator of proposal
    /// @param assessParticipantSize size of assess participant
    /// @param assessData result of assess
    function assessProposal(
        bytes32 proposalID,
        uint256 validatorSize,
        uint256 assessParticipantSize,
        uint64[] calldata assessData
    ) external;

    /// @notice notify that vote is finished
    /// @dev this is called by vote contract
    /// @param proposalID id of proposal
    /// @param validatorSize size of valid validator of proposal's vote
    /// @param voteResult result of proposal's vote
    function finishVote(
        bytes32 proposalID,
        uint256 validatorSize,
        uint64[] calldata voteResult
    ) external;

    /// @notice distribute the vote fees to validators
    /// @param _proposalID id of proposal
    /// @param _start the start index of validators that
    ///     is to receive a vote fee.
    function distributeVoteFees(bytes32 _proposalID, uint256 _start) external;

    /// @notice withdraw the funds of the proposal
    /// @param _proposalID id of proposal
    /// @return code the status code
    /// @return countingFinishTime the time of the vote counting
    function checkWithdrawState(bytes32 _proposalID)
        external
        view
        returns (string memory code, uint256 countingFinishTime);

    /// @notice withdraw the funds of the proposal
    /// @param _proposalID id of proposal
    function withdraw(bytes32 _proposalID) external;
}
