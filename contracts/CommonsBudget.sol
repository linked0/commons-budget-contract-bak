// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.9.0;

contract CommonsBudget {

    event Received(address, uint);

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}
