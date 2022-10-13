// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./ICommonsBudget.sol";

contract CommonsBudget is IERC165, ICommonsBudget {
    event Received(address, uint256);
    event DAOSet(address);

    address public owner;
    address public daoContract;

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
            this.isOwner.selector ^
                this.setDAOContract.selector;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "NotAuthorized");
        _;
    }

    /// @notice check if an address is the owner of the contract
    /// @param account the address to be checked
    /// @return return `true` if the `account` is owner
    function isOwner(address account) external view override returns (bool) {
        return owner == account;
    }

    /// @notice set DAO address to transfer budget
    /// @param contractAddress the address of DAO contract
    function setDAOContract(address contractAddress) external override onlyOwner {
        daoContract = contractAddress;
        emit DAOSet(contractAddress);
    }

    /// @notice transfer budget to DAO address
    /// @param amount the amount to be transferred
    function transferBudget(uint256 amount) external override {
        if (daoContract != address(0)) {
            payable(daoContract).transfer(amount);
        }
    }
}
