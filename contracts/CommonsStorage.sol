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

    function getFundProposalFeePermil() external override view returns (uint32) {
        return fund_proposal_fee_permil;
    }

    // Its unit is cent of BOA.
    function setSystemProposalFee(uint256 _value) external override onlyOwner {
        system_proposal_fee = _value;
    }

    function getSystemProposalFee() external override view returns (uint256) {
        return system_proposal_fee;
    }

    // Proposal Fee = Number of validators * _value / 1000000
    function setVoteQuorumFactor(uint32 _value) external override onlyOwner {
        require(_value > 0 && _value < 1000000, "InvalidInput");
        vote_quorum_factor = _value;
    }

    function getVoteQuorumFactor() external override view returns (uint32) {
        return vote_quorum_factor;
    }

    function setVoterFee(uint256 _value) external override onlyOwner {
        voter_fee = _value;
    }

    function getVoterFee() external override view returns (uint256) {
        return voter_fee;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "NotAuthorized");
        _;
    }

    function assessProposal(
        uint256 _validatorSize,
        uint256 _assessParticipantSize,
        uint64[] calldata _assessData
    )
        external
        returns (ICommonsBudget.ProposalStates)
    {
        if (_assessParticipantSize > 0) {
            uint256 minPass = 5 * _assessParticipantSize; // average 5 each
            uint256 sum = 0;
            for (uint256 j = 0; j < _assessData.length; j++) {
                if (_assessData[j] < minPass) {
                    return ICommonsBudget.ProposalStates.REJECTED;
                }
                sum += _assessData[j];
            }
            // check total average 7 above
            minPass = _assessData.length * 7 * _assessParticipantSize;
            if (sum < minPass) {
                return ICommonsBudget.ProposalStates.REJECTED;
            }

            return ICommonsBudget.ProposalStates.ACCEPTED;
        } else {
            return ICommonsBudget.ProposalStates.REJECTED;
        }
    }

    function finishVote(
        address _voteAddress,
        bytes32 _proposalID,
        uint256 _validatorSize,
        uint64[] calldata _voteResult
    )
        external
        returns (ICommonsBudget.ProposalResult)
    {
        IVoteraVote voteraVote = IVoteraVote(_voteAddress);

        uint64[] memory voteResult = voteraVote.getVoteResult(_proposalID);
        require(voteResult.length == _voteResult.length, "InvalidInput");
        uint256 voteCount = 0;
        for (uint256 i = 0; i < voteResult.length; i++) {
            require(voteResult[i] == _voteResult[i], "InvalidInput");
            voteCount += voteResult[i];
        }

        // Check if it has sufficient number of quorum member
        if (voteCount < (_validatorSize * vote_quorum_factor) / 1000000) {
            return ICommonsBudget.ProposalResult.INVALID_QUORUM;
        }
        // Check if it has sufficient number of positive votes
        else if (voteResult[1] <= voteResult[2] ||
            ((voteResult[1] - voteResult[2]) * 100) / voteCount < approval_diff_percent) {
            return ICommonsBudget.ProposalResult.REJECTED;
        } else {
            return ICommonsBudget.ProposalResult.APPROVED;
        }
    }
}
