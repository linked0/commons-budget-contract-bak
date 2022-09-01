pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./CStorage.sol";
import "hardhat/console.sol";

contract CBudgetV2 is CStorage, UUPSUpgradeable, OwnableUpgradeable{
    // Emitted when the stored value changes
    event ValueChanged(uint256 newValue);

    // Stores a new value in the contract
    function set(uint256 newValue) public {
        value = newValue;
        emit ValueChanged(newValue);
    }

    // Reads the last stored value
    function get() public view returns (uint256) {
        console.log("CBudgetV2 address: ", address(this));
        return value + 100;
    }

    function _authorizeUpgrade(address newImplementation) internal virtual override {

    }
}
