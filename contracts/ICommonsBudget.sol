// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ICommonsBudget {
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

    /// @notice notify that vote is finished
    /// @dev this is called by vote manager
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
}
