// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IVoteraVote {
    function init(bytes32 proposalID) external;

    function getManager() external view returns (address);

    function getValidatorCount(bytes32 proposalID) external view returns (uint256);

    function getVoteResult(bytes32 proposalID) external view returns (uint64[] memory);

    function submitBallot(
        bytes32 proposalID,
        bytes32 commitment,
        bytes calldata signature
    ) external;
}
