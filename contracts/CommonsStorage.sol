// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "./IVoteraVote.sol";
import "./ICommonsBudget.sol";
import "./ICommonsStorage.sol";

contract CommonsStorage is ICommonsStorage {
    // The address of the owner that created the CommonsBudget contract
    address private owner;

    // The address of the CommonsBudget that created this contract
    address private commonsBudgetAddress;

    // It is a fee for the funding proposal. This is not a unit of BOA.
    // This is a thousand percent.
    // Proposal Fee = Funding amount * fund_proposal_fee_permil / 1000
    uint32 public fund_proposal_fee_permil;

    // It is a fee for system proposals. Its unit is cent of BOA.
    uint256 public system_proposal_fee;

    // Factor required to calculate a valid quorum
    // Quorum = Number of validators * vote_quorum_permil / 1000000
    uint32 public vote_quorum_factor;

    // It is a fee to be paid for the validator that participates
    // in a voting, which is a voter. Its unit is cent of BOA.
    uint256 public voter_fee;

    // The max count of validators that CommonsBudget can distribute
    // vote fess to in an attempt of distribution.
    uint256 public vote_fee_distrib_count;

    // The difference for approval between the net percent of positive votes
    // and the net percentage of negative votes
    uint256 public constant approval_diff_percent = 10;

    constructor(address _owner, address _budgetAddress) {
        owner = _owner;
        commonsBudgetAddress = _budgetAddress;
        fund_proposal_fee_permil = 10;
        system_proposal_fee = 100000000000000000000;
        vote_quorum_factor = 333333; // Number of validators / 3
        voter_fee = 400000000000000;
        vote_fee_distrib_count = 100;
    }

    // Proposal Fee = Funding amount * _value / 1000
    function setFundProposalFeePermil(uint32 _value) external override onlyOwner {
        fund_proposal_fee_permil = _value;
    }

    // Its unit is cent of BOA.
    function setSystemProposalFee(uint256 _value) external override onlyOwner {
        system_proposal_fee = _value;
    }

    // Proposal Fee = Number of validators * _value / 1000000
    function setVoteQuorumFactor(uint32 _value) external override onlyOwner {
        require(_value > 0 && _value < 1000000, "InvalidInput");
        vote_quorum_factor = _value;
    }

    function setVoterFee(uint256 _value) external override onlyOwner {
        voter_fee = _value;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "NotAuthorized");
        _;
    }
}
