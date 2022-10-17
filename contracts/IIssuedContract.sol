// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IIssuedContract {
    /// @notice check if an address is the owner of the contract
    /// @param account the address to be checked
    /// @return return `true` if the `account` is owner
    function isOwner(address account) external view returns (bool);

    /// @notice get the owner of this contract
    /// @return the address of the current owner
    function getOwner() external view returns (address);

    /// @notice change the owner of this contract
    /// @param newOwner the address of the new owner
    function setOwner(address newOwner) external;

    /// @notice set the address of the Commons Budget contract
    /// @param contractAddress the address of the Commons Budget contract
    function setCommonsBudget(address contractAddress) external;

    /// @notice transfer budget to the commons budget contract
    /// @param amount the amount to be transferred
    function transferBudget(uint256 amount) external;
}
