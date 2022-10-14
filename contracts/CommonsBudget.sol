// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract CommonsBudget {
    event Received(address, uint256);

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    constructor() {}
}
