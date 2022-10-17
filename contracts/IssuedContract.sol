// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "./IIssuedContract.sol";

contract IssuedContract is IERC165, IIssuedContract {
    event Received(address, uint256);
    event CommonsBudgetContractSet(address);

    address public owner;
    address public commonsBudget;

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    constructor() {
        owner = msg.sender;
        commonsBudget = address(0);
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
        interfaceId == this.supportsInterface.selector ||
        interfaceId ==
        this.isOwner.selector ^ this.getOwner.selector ^ this.setOwner.selector ^ this.setCommonsBudget.selector;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "NotAuthorized");
        _;
    }

    modifier isContract(address _a) {
        uint256 len;
        assembly {
            len := extcodesize(_a)
        }
        require(len > 0, "NotContract");
        _;
    }

    /// @notice check if an address is the owner of the contract
    /// @param account the address to be checked
    /// @return return `true` if the `account` is owner
    function isOwner(address account) external view override returns (bool) {
        return owner == account;
    }

    /// @notice get the owner of this contract
    /// @return the address of the current owner
    function getOwner() external view override returns (address) {
        return owner;
    }

    /// @notice change the owner of this contract
    /// @param newOwner the address of the new owner
    function setOwner(address newOwner) external override onlyOwner {
        owner = newOwner;
    }

    /// @notice set the address of the Commons Budget contract
    /// @param contractAddress the address of the Commons Budget contract
    function setCommonsBudget(address contractAddress) external override onlyOwner isContract(contractAddress) {
        commonsBudget = contractAddress;
        emit CommonsBudgetContractSet(contractAddress);
    }
}
