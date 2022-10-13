// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ICommonsBudget {
    /// @notice check if an address is the owner of the contract
    /// @param account the address to be checked
    /// @return return `true` if the `account` is owner
    function isOwner(address account) external view returns (bool);

    /// @notice set DAO address to transfer budget
    /// @param contractAddress the address of DAO contract
    function setDAOContract(address contractAddress) external;
}
