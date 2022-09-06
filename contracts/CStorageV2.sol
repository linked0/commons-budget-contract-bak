// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./ICommonsStorage.sol";
import "hardhat/console.sol";

contract CStorageV2 is ICommonsStorage {
    // The address of the owner that created the CommonsBudget contract
    address private owner;

    // The address of the CommonsBudget that created this contract
    address private commonsBudgetAddress;

    bool private data;

    constructor() {
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "NotAuthorized");
        _;
    }

    modifier onlyCommonsBudget() {
        require(msg.sender == commonsBudgetAddress, "NotAuthorized");
        _;
    }

    function setCommonsBudgetAddress(address commonsAddress) external onlyOwner {
        commonsBudgetAddress = commonsAddress;
    }

    function setFundProposalFeePermil(uint32 _value) external override onlyOwner {
    }

    // Its unit is cent of BOA.
    function setSystemProposalFee(uint256 _value) external override onlyOwner {
    }

    // Proposal Fee = Number of validators * _value / 1000000
    function setVoteQuorumFactor(uint32 _value) external override onlyOwner {
    }

    function setVoterFee(uint256 _value) external override onlyOwner {
    }

    function setWithdrawn(bytes32 _proposalID) external override onlyCommonsBudget {
        data = true;
        console.log("CStorageV2 setWithdrawn");
    }
}
