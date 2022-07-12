//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "./ICommonsBudget.sol";
import "./IVoteraVote.sol";

// E000 : authorization error
// E001 : invalid input error
// E002 : state error
// E003 : Too Late
// E004 : Too Early
// E005 : invalid signature

contract VoteraVote is Ownable, IVoteraVote {
    struct VoteInfo {
        address commonsBudgetAddress;
        uint64 startVote;
        uint64 endVote;
        uint64 openVote;
        string info;
        bool finishVote;
        uint64[3] voteResult;
    }

    struct ValidatorMap {
        address[] keys;
        mapping(address => bool) values;
    }

    enum Candidate {
        BLANK,
        YES,
        NO
    }

    struct Ballot {
        address key;
        Candidate choice;
        uint64 nonce;
        bytes32 commitment;
    }
    struct VoterMap {
        address[] keys;
        mapping(address => Ballot) values;
    }

    address public commonsBudgetAddress;

    mapping(bytes32 => VoteInfo) public voteInfos;
    mapping(bytes32 => ValidatorMap) private validators;
    mapping(bytes32 => VoterMap) private voters;
    mapping(bytes32 => uint256) private revealCounts;

    event VoteResultPublished(bytes32 _proposalID);

    function changeCommonBudgetContract(address _commonsBudgetAddress) public onlyOwner {
        require(_commonsBudgetAddress != address(0), "E001");
        commonsBudgetAddress = _commonsBudgetAddress;
    }

    function getManager() external view override returns (address) {
        return owner();
    }

    function init(bytes32 _proposalID) external override {
        require(msg.sender == commonsBudgetAddress, "E000");
        require(voteInfos[_proposalID].commonsBudgetAddress == address(0), "E001");
        voteInfos[_proposalID].commonsBudgetAddress = commonsBudgetAddress;
    }

    function setupVoteInfo(
        bytes32 _proposalID,
        uint64 _startVote,
        uint64 _endVote,
        uint64 _openVote,
        string memory _info
    ) public onlyOwner {
        require(isExistProposal(_proposalID), "E001");
        require(block.timestamp < _startVote, "E001");
        require(0 < _startVote && _startVote < _endVote && _endVote < _openVote, "E001");
        require(voteInfos[_proposalID].startVote == 0, "E002");

        voteInfos[_proposalID].startVote = _startVote;
        voteInfos[_proposalID].endVote = _endVote;
        voteInfos[_proposalID].openVote = _openVote;
        voteInfos[_proposalID].info = _info;
    }

    function addValidators(bytes32 _proposalID, address[] calldata _validators) external onlyOwner {
        require(isExistProposal(_proposalID), "E001");
        require(voteInfos[_proposalID].startVote > 0, "E002");
        require(block.timestamp < voteInfos[_proposalID].startVote, "E003");

        uint256 len = _validators.length;
        for (uint256 i = 0; i < len; ++i) {
            address _validator = _validators[i];
            if (!isContainValidator(_proposalID, _validator)) {
                validators[_proposalID].values[_validator] = true;
                validators[_proposalID].keys.push(_validator);
            }
        }
    }

    function isExistProposal(bytes32 _proposalID) private view returns (bool) {
        return voteInfos[_proposalID].commonsBudgetAddress != address(0);
    }

    function isContainValidator(bytes32 _proposalID, address _key) public view returns (bool) {
        return validators[_proposalID].values[_key];
    }

    function getVoterCount(bytes32 _proposalID) public view returns (uint256) {
        return voters[_proposalID].keys.length;
    }

    function isContainVoter(bytes32 _proposalID, address _key) public view returns (bool) {
        return voters[_proposalID].values[_key].key == _key;
    }

    function getValidatorCount(bytes32 _proposalID) external view override returns (uint256) {
        return validators[_proposalID].keys.length;
    }

    function getValidatorAt(bytes32 _proposalID, uint256 _index) public view returns (address) {
        return validators[_proposalID].keys[_index];
    }

    function verifySubmit(
        bytes32 _proposalID,
        address _sender,
        bytes32 _commitment,
        bytes calldata _signature
    ) private view {
        bytes32 dataHash = keccak256(abi.encode(_proposalID, _sender, _commitment));
        require(ECDSA.recover(dataHash, _signature) == owner(), "E001");
    }

    function submitBallot(
        bytes32 _proposalID,
        bytes32 _commitment,
        bytes calldata _signature
    ) external override {
        require(isExistProposal(_proposalID), "E001");
        require(voteInfos[_proposalID].startVote > 0, "E002");
        require(isContainValidator(_proposalID, msg.sender), "E000");
        require(block.timestamp >= voteInfos[_proposalID].startVote, "E004");
        require(block.timestamp < voteInfos[_proposalID].endVote, "E003");
        verifySubmit(_proposalID, msg.sender, _commitment, _signature);

        if (isContainVoter(_proposalID, msg.sender)) {
            voters[_proposalID].values[msg.sender].commitment = _commitment;
        } else {
            voters[_proposalID].values[msg.sender] = Ballot({
                key: msg.sender,
                commitment: _commitment,
                choice: Candidate.BLANK,
                nonce: 0
            });
            voters[_proposalID].keys.push(msg.sender);
        }
    }

    function getBallot(bytes32 _proposalID, address validator) public view returns (Ballot memory) {
        return voters[_proposalID].values[validator];
    }

    function getBallotAtIndex(bytes32 _proposalID, uint256 _index) public view returns (Ballot memory) {
        require(isExistProposal(_proposalID) && _index < getVoterCount(_proposalID), "E001");
        require(block.timestamp >= voteInfos[_proposalID].endVote, "E004");
        return voters[_proposalID].values[voters[_proposalID].keys[_index]];
    }

    function revealBallot(
        bytes32 _proposalID,
        address[] calldata _validators,
        Candidate[] calldata _choices,
        uint64[] calldata _nonces
    ) external onlyOwner {
        require(
            isExistProposal(_proposalID) &&
                _validators.length == _choices.length &&
                _validators.length == _nonces.length,
            "E001"
        );
        require(!voteInfos[_proposalID].finishVote && voteInfos[_proposalID].openVote > 0, "E002");
        require(block.timestamp >= voteInfos[_proposalID].openVote, "E004");

        address voteContract = address(this);
        uint256 len = _validators.length;
        uint256 _revealCount = revealCounts[_proposalID];

        for (uint256 i = 0; i < len; ++i) {
            address _validator = _validators[i];
            if (isContainVoter(_proposalID, _validator)) {
                require(_nonces[i] != 0, "E001");

                bytes32 dataHash = keccak256(
                    abi.encode(voteContract, _proposalID, _validator, _choices[i], _nonces[i])
                );
                require(dataHash == voters[_proposalID].values[_validator].commitment, "E001");

                if (voters[_proposalID].values[_validator].nonce == 0) {
                    ++_revealCount;
                }
                voters[_proposalID].values[_validator].choice = _choices[i];
                voters[_proposalID].values[_validator].nonce = _nonces[i];
            }
        }

        revealCounts[_proposalID] = _revealCount;
    }

    function countVote(bytes32 _proposalID) public onlyOwner {
        require(isExistProposal(_proposalID), "E001");
        require(
            !voteInfos[_proposalID].finishVote &&
                voteInfos[_proposalID].openVote > 0 &&
                revealCounts[_proposalID] == getVoterCount(_proposalID),
            "E002"
        );
        require(block.timestamp >= voteInfos[_proposalID].openVote, "E004");

        uint64[3] memory voteResult;
        uint256 revealCount = revealCounts[_proposalID];

        for (uint256 i = 0; i < revealCount; i++) {
            Candidate choice = voters[_proposalID].values[voters[_proposalID].keys[i]].choice;
            if (choice <= Candidate.NO) {
                voteResult[uint256(choice)]++;
            }
        }

        voteInfos[_proposalID].finishVote = true;
        voteInfos[_proposalID].voteResult = voteResult;

        emit VoteResultPublished(_proposalID);

        ICommonsBudget(voteInfos[_proposalID].commonsBudgetAddress).finishVote(
            _proposalID,
            validators[_proposalID].keys.length,
            voteResult
        );
    }

    function getVoteResult(bytes32 _proposalID) external view override returns (uint64[] memory) {
        require(isExistProposal(_proposalID), "E001");
        require(voteInfos[_proposalID].finishVote && voteInfos[_proposalID].openVote > 0, "E002");
        uint256 len = voteInfos[_proposalID].voteResult.length;
        uint64[] memory _voteResult = new uint64[](len);
        for (uint256 i = 0; i < len; i++) {
            _voteResult[i] = voteInfos[_proposalID].voteResult[i];
        }
        return _voteResult;
    }
}
