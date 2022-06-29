//SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";

import "./IVoteraVote.sol";

// E000 : authorization error
// E001 : invalid input error
// E002 : state error
// E003 : Too Late
// E004 : Too Early
// E005 : invalid signature

contract VoteraVote is Ownable, IVoteraVote {

    struct VoteInfo {
        address budget;

        uint64 startVote;
        uint64 endVote;
        uint64 openVote;
        string info;

        uint revealCount;
        bool votePublished;

        uint64[3] voteCounts;
    }

    struct ValidatorMap {
        address[] keys;
        mapping(address => address) values;
    }

    enum VoteCandidate { BLANK, YES, NO }

    struct Ballot {
        address key;
        VoteCandidate choice;
        uint64 nonce;
        bytes32 commitment;
    }
    struct VoterMap {
        address[] keys;
        mapping(address => Ballot) values;
    }

    address public budget;

    mapping(bytes32 => VoteInfo) public voteInfos;
    mapping(bytes32 => ValidatorMap) private validators;
    mapping(bytes32 => VoterMap) private voters;

    event VoteResultPublished(bytes32 _proposalID);

    function changeBudget(address _budget) public onlyOwner {
        require(_budget != address(0), "E001");
        budget = _budget;
    }

    function getChair() external override view returns (address) {
        return owner();
    }

    function init(bytes32 _proposalID) external override {
        require(msg.sender == budget, "E000");
        require(voteInfos[_proposalID].budget == address(0), "E001");
        voteInfos[_proposalID].budget = budget;
    }

    function setupVoteInfo(bytes32 _proposalID, uint64 _startVote, uint64 _endVote, uint64 _openVote, string memory _info) public onlyOwner {
        require(proposalExists(_proposalID), "E001");
        require(block.timestamp < _startVote, "E001");
        require(0 < _startVote && _startVote < _endVote && _endVote < _openVote, "E001");
        require(voteInfos[_proposalID].startVote == 0, "E002");

        voteInfos[_proposalID].startVote = _startVote;
        voteInfos[_proposalID].endVote = _endVote;
        voteInfos[_proposalID].openVote = _openVote;
        voteInfos[_proposalID].info = _info;
    }

    function addValidators(bytes32 _proposalID, address[] calldata _validators) external onlyOwner {
        require(proposalExists(_proposalID), "E001");
        require(voteInfos[_proposalID].startVote > 0, "E002");
        require(block.timestamp < voteInfos[_proposalID].startVote, "E003");

        uint len = _validators.length;
        for (uint i = 0; i < len; ++i) {
            address _validator = _validators[i];
            if (!validatorContains(_proposalID, _validator)) {
                validators[_proposalID].values[_validator] = _validator;
                validators[_proposalID].keys.push(_validator);
            }
        }
    }

    function proposalExists(bytes32 _proposalID) private view returns (bool) {
        return voteInfos[_proposalID].budget != address(0);
    }

    function validatorContains(bytes32 _proposalID, address _key) private view returns (bool) {
        return validators[_proposalID].values[_key] == _key;
    }

    function votersSize(bytes32 _proposalID) private view returns (uint) {
        return voters[_proposalID].keys.length;
    }

    function votersContains(bytes32 _proposalID, address _key) private view returns (bool) {
        return voters[_proposalID].values[_key].key == _key;
    }

    function getValidatorCount(bytes32 _proposalID) external override view returns (uint) {
        return validators[_proposalID].keys.length;
    }

    function getValidatorAt(bytes32 _proposalID, uint _index) public view returns (address) {
        return validators[_proposalID].keys[_index];
    }

    function verifySubmit(bytes32 _proposalID, address _sender, bytes32 _commitment, bytes calldata _signature) private view {
        bytes32 dataHash = keccak256(abi.encode(_proposalID, _sender, _commitment));
        uint8 v;
        bytes32 r;
        bytes32 s;
        (v, r, s) = signatureSplit(_signature, 0);
        address recover = ecrecover(dataHash, v, r, s);
        require(recover == owner(), "E001"); // confirm via voteraServer
    }

    function submitBallot(bytes32 _proposalID, bytes32 _commitment, bytes calldata _signature) external override {
        require(proposalExists(_proposalID), "E001");
        require(voteInfos[_proposalID].startVote > 0, "E002");
        require(validatorContains(_proposalID, msg.sender), "E000");
        require(block.timestamp >= voteInfos[_proposalID].startVote, "E004");
        require(block.timestamp < voteInfos[_proposalID].endVote, "E003");
        verifySubmit(_proposalID, msg.sender, _commitment, _signature);

        if (votersContains(_proposalID, msg.sender)) {
            voters[_proposalID].values[msg.sender].commitment = _commitment;
        } else {
            voters[_proposalID].values[msg.sender] = Ballot({
                key: msg.sender,
                commitment: _commitment,
                choice: VoteCandidate.BLANK,
                nonce: 0
            });
            voters[_proposalID].keys.push(msg.sender);
        }
    }

    function myBallot(bytes32 _proposalID) public view returns (Ballot memory) {
        return voters[_proposalID].values[msg.sender];
    }

    function ballotCount(bytes32 _proposalID) public view returns (uint) {
        return votersSize(_proposalID);
    }

    function getBallotAtIndex(bytes32 _proposalID, uint _index) public view returns (Ballot memory) {
        require(proposalExists(_proposalID) && _index < votersSize(_proposalID), "E001");
//        require(voteInfos[_proposalID].startVote > 0, "E002"); // unnecessary check because of above check
        require(block.timestamp >= voteInfos[_proposalID].endVote, "E004");
        return voters[_proposalID].values[voters[_proposalID].keys[_index]];
    }

    function signatureSplit(bytes memory signatures, uint pos) private pure returns (uint8 v, bytes32 r, bytes32 s) {
        // The signature format is a compact form of:
        //   {bytes32 r}{bytes32 s}{uint8 v}
        // Compact means, uint8 is not padded to 32 bytes.
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let signaturePos := mul(0x41, pos)
            r := mload(add(signatures, add(signaturePos, 0x20)))
            s := mload(add(signatures, add(signaturePos, 0x40)))
            // Here we are loading the last 32 bytes, including 31 bytes
            // of 's'. There is no 'mload8' to do this.
            //
            // 'byte' is not working due to the Solidity parser, so lets
            // use the second best option, 'and'
            v := and(mload(add(signatures, add(signaturePos, 0x41))), 0xff)
        }
    }

    function revealBallot(bytes32 _proposalID, address[] calldata _keys, VoteCandidate[] calldata _choices, uint64[] calldata _nonces) external onlyOwner {
        require(proposalExists(_proposalID) && _keys.length == _choices.length && _keys.length == _nonces.length, "E001");
        require(!voteInfos[_proposalID].votePublished && voteInfos[_proposalID].openVote > 0, "E002");
        require(block.timestamp >= voteInfos[_proposalID].openVote, "E004");

        address vote = address(this);
        uint len = _keys.length;
        uint _revealCount = voteInfos[_proposalID].revealCount;

        for (uint i = 0; i < len; ++i) {
            address _key = _keys[i];
            if (votersContains(_proposalID, _key)) {
                require(_nonces[i] != 0, "E001");

                bytes32 dataHash = keccak256(abi.encode(vote, _proposalID, _key, _choices[i], _nonces[i]));
                require(dataHash == voters[_proposalID].values[_key].commitment, "E001");

                if (voters[_proposalID].values[_key].nonce == 0) {
                    ++_revealCount;
                }
                voters[_proposalID].values[_key].choice = _choices[i];
                voters[_proposalID].values[_key].nonce = _nonces[i];
            }
        }

        voteInfos[_proposalID].revealCount = _revealCount;
    }

    function registerResult(bytes32 _proposalID) public onlyOwner {
        require(proposalExists(_proposalID), "E001");
        require(!voteInfos[_proposalID].votePublished && voteInfos[_proposalID].openVote > 0 && voteInfos[_proposalID].revealCount == votersSize(_proposalID), "E002");
        require(block.timestamp >= voteInfos[_proposalID].openVote, "E004");

        uint64[3] memory voteCounts;
        uint revealCount = voteInfos[_proposalID].revealCount;

        for (uint i = 0; i < revealCount; i++) {
            VoteCandidate choice = voters[_proposalID].values[voters[_proposalID].keys[i]].choice;
            if (choice <= VoteCandidate.NO) {
                voteCounts[uint(choice)]++;
            }
        }

        voteInfos[_proposalID].votePublished = true;
        voteInfos[_proposalID].voteCounts = voteCounts;

        emit VoteResultPublished(_proposalID);
    }

    function getVoteCounts(bytes32 _proposalID) external override view returns (uint64[] memory) {
        require(proposalExists(_proposalID), "E001");
        require(voteInfos[_proposalID].votePublished && voteInfos[_proposalID].openVote > 0, "E002");
        // require(block.timestamp >= voteInfos[_proposalID].openVote, "E004"); // unneccesary check because of above check
        uint len = voteInfos[_proposalID].voteCounts.length;
        uint64[] memory _voteCounts = new uint64[](len);
        for (uint i = 0; i < len; i++) {
            _voteCounts[i] = voteInfos[_proposalID].voteCounts[i];
        }
        return _voteCounts;
    }
}
