// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IVoteraVote {
    /// @notice initialize vote
    /// @dev this is called by commons budget contract
    /// @param proposalID id of proposal
    /// @param startVote vote starting time (seconds since the epoch)
    /// @param endVote vote ending time (seconds since the epoch)
    function init(bytes32 proposalID, uint64 startVote, uint64 endVote) external;

    /// @notice get votera vote manager
    /// @return returns address of votera vote manager
    function getManager() external view returns (address);

    /// @notice get count of validators of proposal
    /// @param proposalID id of proposal
    /// @return returns the count of validators
    function getValidatorCount(bytes32 proposalID) external view returns (uint256);

    /// @notice get vote result of proposal
    /// @param proposalID id of proposal
    /// @return returns the result of vote
    function getVoteResult(bytes32 proposalID) external view returns (uint64[] memory);

    /// @notice submit ballot
    /// @param proposalID id of proposal
    /// @param commitment commitment of ballot
    /// @param signature signature of commitment by vote manager 
    function submitBallot(
        bytes32 proposalID,
        bytes32 commitment,
        bytes calldata signature
    ) external;
}
