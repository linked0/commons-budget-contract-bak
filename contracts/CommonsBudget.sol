// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./ICommonsBudget.sol";

contract CommonsBudget is IERC165, ICommonsBudget {
    event Received(address, uint256);

    address public owner;

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    constructor() {
        owner = msg.sender;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == this.supportsInterface.selector ||
            interfaceId ==
            this.isOwner.selector;
    }

    /// @notice check if an address is the owner of the contract
    /// @param account the address to be checked
    /// @return return `true` if the `account` is owner
    function isOwner(address account) external view override returns (bool) {
        return owner == account;
    }
}
