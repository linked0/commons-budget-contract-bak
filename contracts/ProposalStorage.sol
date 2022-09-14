// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ICommonsBudget.sol";

contract ProposalStorage {
    mapping(bytes32 => ICommonsBudget.ProposalData) internal proposalMaps;
}
