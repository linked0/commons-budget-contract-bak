// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ICommonsBudget {
    /// @notice create system proposal
    /// @param proposalID id of proposal
    /// @param title title of proposal
    /// @param start vote starting time (seconds since the epoch)
    /// @param end vote ending time (seconds since the epoch)
    /// @param docHash hash data of proposal description and attachment
    /// @param signature signature data from vote manager of proposal
    function createSystemProposal(
        bytes32 proposalID,
        string calldata title,
        uint64 start,
        uint64 end,
        bytes32 docHash,
        bytes calldata signature
    ) external payable;

    /// @notice create fund proposal
    /// @param proposalID id of proposal
    /// @param title title of proposal
    /// @param start vote starting time (seconds since the epoch)
    /// @param end vote ending time (seconds since the epoch)
    /// @param docHash hash data of proposal description and attachment
    /// @param amount requesting fund amount
    /// @param proposer address of proposer
    /// @param signature signature data from vote manager of proposal
    function createFundProposal(
        bytes32 proposalID,
        string calldata title,
        uint64 start,
        uint64 end,
        bytes32 docHash,
        uint256 amount,
        address proposer,
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
}
