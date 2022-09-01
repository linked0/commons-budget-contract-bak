// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ICommonsStorage {
    function setFundProposalFeePermil(uint32 _value) external;

    function getFundProposalFeePermil() external view returns (uint32);

    function setSystemProposalFee(uint256 _value) external;

    function getSystemProposalFee() external view returns (uint256);

    function setVoteQuorumFactor(uint32 _value) external;

    function getVoteQuorumFactor() external view returns (uint32);

    function setVoterFee(uint256 _value) external;

    function getVoterFee() external view returns (uint256);
}
