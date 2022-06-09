// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.9.0;

interface ICommonsBudget {
    function votePublished(bytes32 proposalID, uint validatorSize, uint64[] calldata voteCounts) external;
}
