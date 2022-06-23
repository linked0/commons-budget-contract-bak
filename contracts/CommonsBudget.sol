// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract CommonsBudget is Ownable {
    event Received(address, uint256);

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    // It is a fee for the funding proposal. This is not a unit of BOA.
    // This is a thousand percent.
    // Proposal Fee = Funding amount * fund_proposal_fee_permil / 1000
    uint32 fund_proposal_fee_permil;

    // It is a fee for system proposals. Its unit is cent of BOA.
    uint256 system_proposal_fee;

    constructor() {
        fund_proposal_fee_permil = 10;
        system_proposal_fee = 100000000000000000000;
    }

    // Proposal Fee = Funding amount * _value / 1000
    function setFundProposalFeePermil(uint32 _value) public onlyOwner {
        fund_proposal_fee_permil = _value;
    }

    function getFundProposalFeePermil() public view returns (uint32) {
        return fund_proposal_fee_permil;
    }

    // Its unit is cent of BOA.
    function setSystemProposalFee(uint256 _value) public onlyOwner {
        system_proposal_fee = _value;
    }

    function getSystemProposalFee() public view returns (uint256) {
        return system_proposal_fee;
    }
}
