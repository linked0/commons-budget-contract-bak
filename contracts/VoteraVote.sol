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
    enum VoteState {
        INVALID,
        CREATED,
        RUNNING,
        FINISHED
    }

    struct VoteInfo {
        VoteState state;
        address commonsBudgetAddress;
        uint64 startVote;
        uint64 endVote;
        uint64 openVote;
        string info;
        uint64[] voteResult;
    }

    enum ValidatorListState {
        INVALID,
        SETTING,
        FINALIZED
    }

    struct ValidatorMap {
        ValidatorListState state;
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
    struct BallotMap {
        address[] keys;
        mapping(address => Ballot) values;
    }

    address public commonsBudgetAddress;

    mapping(bytes32 => VoteInfo) public voteInfos;
    mapping(bytes32 => ValidatorMap) private validators;
    mapping(bytes32 => BallotMap) private ballots;
    mapping(bytes32 => uint256) private revealCounts;

    event VoteResultPublished(bytes32 _proposalID);

    /// @notice change common budget contract address
    /// @param _commonsBudgetAddress address of common budget contract
    function changeCommonBudgetContract(address _commonsBudgetAddress) public onlyOwner {
        require(_commonsBudgetAddress != address(0), "E001");
        commonsBudgetAddress = _commonsBudgetAddress;
    }

    /// @notice get address of manager of vote
    /// @return returns address of vote manager
    function getManager() external view override returns (address) {
        return owner();
    }

    /// @notice initialize vote
    /// @dev this is called by commons budget contract
    /// @param _proposalID id of proposal
    /// @param _startVote vote starting time (seconds since the epoch)
    /// @param _endVote vote ending time (seconds since the epoch)
    function init(
        bytes32 _proposalID,
        uint64 _startVote,
        uint64 _endVote
    ) external override {
        require(msg.sender == commonsBudgetAddress, "E000");
        require(
            voteInfos[_proposalID].state == VoteState.INVALID &&
                voteInfos[_proposalID].commonsBudgetAddress == address(0),
            "E001"
        );
        require(block.timestamp < _startVote && _startVote < _endVote, "E001");

        voteInfos[_proposalID].state = VoteState.CREATED;
        voteInfos[_proposalID].commonsBudgetAddress = commonsBudgetAddress;
        voteInfos[_proposalID].startVote = _startVote;
        voteInfos[_proposalID].endVote = _endVote;
    }

    /// @notice set additional vote information
    /// @param _proposalID id of proposal
    /// @param _startVote vote starting time (seconds since the epoch)
    /// @param _endVote vote ending time (seconds since the epoch)
    /// @param _openVote vote opening time (seconds since the epoch)
    /// @param _info additional information url for this vote
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
        require(voteInfos[_proposalID].state == VoteState.CREATED, "E002");
        require(voteInfos[_proposalID].startVote == _startVote && voteInfos[_proposalID].endVote == _endVote, "E002");

        voteInfos[_proposalID].state = VoteState.RUNNING;
        voteInfos[_proposalID].openVote = _openVote;
        voteInfos[_proposalID].info = _info;

        validators[_proposalID].state = ValidatorListState.SETTING;
    }

    /// @notice add validator
    /// @param _proposalID id of proposal
    /// @param _validators address of validators
    /// @param _finalized is last validator or not
    function addValidators(
        bytes32 _proposalID,
        address[] calldata _validators,
        bool _finalized
    ) external onlyOwner {
        require(isExistProposal(_proposalID), "E001");
        require(voteInfos[_proposalID].state == VoteState.RUNNING, "E002");
        require(validators[_proposalID].state == ValidatorListState.SETTING, "E002");
        require(block.timestamp < voteInfos[_proposalID].startVote, "E003");

        uint256 len = _validators.length;
        for (uint256 i = 0; i < len; ++i) {
            address _validator = _validators[i];
            if (!isContainValidator(_proposalID, _validator)) {
                validators[_proposalID].values[_validator] = true;
                validators[_proposalID].keys.push(_validator);
            }
        }

        if (_finalized) {
            validators[_proposalID].state = ValidatorListState.FINALIZED;
        }
    }

    /// @notice get validators for the proposal
    /// @param _proposalID id of proposal
    /// @return addresses of the validators
    function getValidators(bytes32 _proposalID) external view override returns (address[] memory) {
        return validators[_proposalID].keys;
    }

    function isExistProposal(bytes32 _proposalID) private view returns (bool) {
        return voteInfos[_proposalID].state != VoteState.INVALID;
    }

    /// @notice check whether registered validator of proposal
    /// @param _proposalID id of proposal
    /// @param _address check address
    /// @return returns true if address is validator or false
    function isContainValidator(bytes32 _proposalID, address _address) public view returns (bool) {
        return validators[_proposalID].values[_address];
    }

    /// @notice get count of ballot
    /// @param _proposalID id of proposal
    /// @return returns the count of ballot of vote
    function getBallotCount(bytes32 _proposalID) public view returns (uint256) {
        return ballots[_proposalID].keys.length;
    }

    /// @notice check whether ballot is exist or not
    /// @param _proposalID id of proposal
    /// @param _address address of validator
    /// @return returns true if found ballot, or false
    function isContainBallot(bytes32 _proposalID, address _address) public view returns (bool) {
        return ballots[_proposalID].values[_address].key == _address;
    }

    /// @notice get validator list state
    /// @return returns the state of validator list
    function getValidatorListState(bytes32 _proposalID) public view returns (ValidatorListState) {
        return validators[_proposalID].state;
    }

    /// @notice get count of validator
    /// @param _proposalID id of proposal
    /// @return returns the count of proposal
    function getValidatorCount(bytes32 _proposalID) external view override returns (uint256) {
        return validators[_proposalID].keys.length;
    }

    /// @notice get validator at index
    /// @param _proposalID id of proposal
    /// @param _index index
    /// @return returns the ballot at that index
    function getValidatorAt(bytes32 _proposalID, uint256 _index) public view returns (address) {
        return validators[_proposalID].keys[_index];
    }

    function verifyBallot(
        bytes32 _proposalID,
        address _sender,
        bytes32 _commitment,
        bytes calldata _signature
    ) private view {
        bytes32 dataHash = keccak256(abi.encode(_proposalID, _sender, _commitment));
        require(ECDSA.recover(dataHash, _signature) == owner(), "E001");
    }

    /// @notice submit ballot
    /// @param _proposalID id of proposal
    /// @param _commitment commitment of ballot
    /// @param _signature signature of commitment by vote manager
    function submitBallot(
        bytes32 _proposalID,
        bytes32 _commitment,
        bytes calldata _signature
    ) external override {
        require(isExistProposal(_proposalID), "E001");
        require(voteInfos[_proposalID].state == VoteState.RUNNING, "E002");
        require(isContainValidator(_proposalID, msg.sender), "E000");
        require(block.timestamp >= voteInfos[_proposalID].startVote, "E004");
        require(block.timestamp < voteInfos[_proposalID].endVote, "E003");
        verifyBallot(_proposalID, msg.sender, _commitment, _signature);

        if (isContainBallot(_proposalID, msg.sender)) {
            ballots[_proposalID].values[msg.sender].commitment = _commitment;
        } else {
            ballots[_proposalID].values[msg.sender] = Ballot({
                key: msg.sender,
                commitment: _commitment,
                choice: Candidate.BLANK,
                nonce: 0
            });
            ballots[_proposalID].keys.push(msg.sender);
        }
    }

    /// @notice get ballot of validator
    /// @param _proposalID id of proposal
    /// @param _validator address of validator
    /// @return returns the ballot of validator
    function getBallot(bytes32 _proposalID, address _validator) public view returns (Ballot memory) {
        return ballots[_proposalID].values[_validator];
    }

    /// @notice get ballot at that index
    /// @param _proposalID id of proposal
    /// @param _index index
    /// @return returns the ballot at that index
    function getBallotAt(bytes32 _proposalID, uint256 _index) public view returns (Ballot memory) {
        require(isExistProposal(_proposalID) && _index < getBallotCount(_proposalID), "E001");
        require(block.timestamp >= voteInfos[_proposalID].endVote && voteInfos[_proposalID].endVote > 0, "E004");
        return ballots[_proposalID].values[ballots[_proposalID].keys[_index]];
    }

    /// @notice submit revealed ballot after end of vote
    /// @param _proposalID id of proposal
    /// @param _validators array of address of validators
    /// @param _choices array of vote choice of validator
    /// @param _nonces array of vote nonce
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
        require(voteInfos[_proposalID].state == VoteState.RUNNING, "E002");
        require(block.timestamp >= voteInfos[_proposalID].openVote && voteInfos[_proposalID].openVote > 0, "E004");

        address voteContract = address(this);
        uint256 len = _validators.length;
        uint256 _revealCount = revealCounts[_proposalID];

        for (uint256 i = 0; i < len; ++i) {
            address _validator = _validators[i];
            if (isContainBallot(_proposalID, _validator)) {
                require(_nonces[i] != 0, "E001");

                bytes32 dataHash = keccak256(
                    abi.encode(voteContract, _proposalID, _validator, _choices[i], _nonces[i])
                );
                require(dataHash == ballots[_proposalID].values[_validator].commitment, "E001");

                if (ballots[_proposalID].values[_validator].nonce == 0) {
                    ++_revealCount;
                }
                ballots[_proposalID].values[_validator].choice = _choices[i];
                ballots[_proposalID].values[_validator].nonce = _nonces[i];
            }
        }

        revealCounts[_proposalID] = _revealCount;
    }

    /// @notice count vote result after all ballot are revealed
    /// @param _proposalID id of proposal
    function countVote(bytes32 _proposalID) public onlyOwner {
        require(isExistProposal(_proposalID), "E001");
        require(
            voteInfos[_proposalID].state == VoteState.RUNNING &&
                revealCounts[_proposalID] == getBallotCount(_proposalID),
            "E002"
        );
        require(block.timestamp >= voteInfos[_proposalID].openVote && voteInfos[_proposalID].openVote > 0, "E004");

        uint64[] memory voteResult = new uint64[](3);
        uint256 revealCount = revealCounts[_proposalID];

        for (uint256 i = 0; i < revealCount; i++) {
            Candidate choice = ballots[_proposalID].values[ballots[_proposalID].keys[i]].choice;
            if (choice <= Candidate.NO) {
                voteResult[uint256(choice)]++;
            }
        }

        voteInfos[_proposalID].state = VoteState.FINISHED;
        voteInfos[_proposalID].voteResult = voteResult;

        ICommonsBudget(voteInfos[_proposalID].commonsBudgetAddress).finishVote(
            _proposalID,
            validators[_proposalID].keys.length,
            voteResult
        );
        emit VoteResultPublished(_proposalID);
    }

    /// @notice get vote result
    /// @param _proposalID id of proposal
    function getVoteResult(bytes32 _proposalID) external view override returns (uint64[] memory) {
        require(isExistProposal(_proposalID), "E001");
        require(voteInfos[_proposalID].state == VoteState.FINISHED, "E002");
        uint256 len = voteInfos[_proposalID].voteResult.length;
        uint64[] memory _voteResult = new uint64[](len);
        for (uint256 i = 0; i < len; i++) {
            _voteResult[i] = voteInfos[_proposalID].voteResult[i];
        }
        return _voteResult;
    }
}
