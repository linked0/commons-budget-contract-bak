//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./CStorage.sol";
import "hardhat/console.sol";

contract CBudget is CStorage, UUPSUpgradeable, OwnableUpgradeable {
    event Received(address, uint256);

    // Emitted when the stored value changes
    event ValueChanged(uint256 newValue);

    // Stores a new value in the contract
    function set(uint256 newValue) public {
        value = newValue;
        emit ValueChanged(newValue);
    }

    // Reads the last stored value
    function get() public view returns (uint256) {
        console.log("CBudget address: ", address(this));
        return value;
    }

    function sendFund(address validator) public {
        uint256 voter_fee = 200000000000000000000000;
        payable(validator).transfer(voter_fee);
    }

    function _authorizeUpgrade(address newImplementation) internal virtual override {

    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /// @notice create fund proposal
    /// @param _proposalID id of proposal
    function createFundProposal(
        bytes32 _proposalID
    ) external payable {
        require(msg.value >= 100, "InvalidFee");
    }
}

