// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.9.0;

interface IVoteraVote {
    function init(bytes32 proposalID) external;
    function getChair() external view returns (address);
    function getValidatorCount(bytes32 proposalID) external view returns (uint);
    function getVoteCounts(bytes32 proposalID) external view returns (uint64[] memory);
    function submitBallot(bytes32 proposalID, bytes32 commitment, bytes calldata signature) external;
}
