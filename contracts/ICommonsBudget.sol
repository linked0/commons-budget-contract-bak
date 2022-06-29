// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.9.0;

interface ICommonsBudget {
    function makeSystemProposalData(bytes32 proposalID, string calldata title, uint64 start, uint64 end, bytes32 docHash) external payable;
    function makeFundProposalData(bytes32 proposalID, string calldata title, uint64 start, uint64 end, bytes32 docHash, uint amount, address proposer) external payable;
    function votePublished(
        bytes32 proposalID,
        uint256 validatorSize,
        uint64[] calldata voteCounts
    ) external;
    function voteStarted(bytes32 proposalID) external;
    function rejectAssess(bytes32 proposalID) external;
}
