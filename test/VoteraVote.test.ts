import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle";
import { ethers, network, waffle } from "hardhat";
import crypto from "crypto";
import { BigNumber, utils } from "ethers";
import {
    CommonsBudget,
    CommonsBudget__factory as CommonsBudgetFactory,
    VoteraVote,
    VoteraVote__factory as VoteraVoteFactory,
    // eslint-disable-next-line node/no-missing-import
} from "../typechain";
import { getHash, makeCommitment, signCommitment, signSystemPropsal } from "./VoteHelper";

const AddressZero = "0x0000000000000000000000000000000000000000";
const InvalidProposal = "0x43d26d775ef3a282483394ce041a2757fbf700c9cf86accc6f0ce410accf123f";

chai.use(solidity);

async function displayBalance(address: string, message: string) {
    const balance = await ethers.provider.getBalance(address);
    console.log(`${message}_balance = ${balance}`);
}

function getNewProposal() {
    for (;;) {
        const proposal = `0x${crypto.randomBytes(32).toString("hex")}`;
        if (proposal !== InvalidProposal) {
            return proposal;
        }
    }
}

describe("VoteraVote", function () {
    let budget: CommonsBudget;

    const provider = waffle.provider;
    const [deployer, budgetManager, voteManager, ...validators] = provider.getWallets();
    const basicFee = ethers.utils.parseEther("100.0");

    let proposal: string;
    let voteAddress: string;

    let voteraVote: VoteraVote;
    let voteBudget: CommonsBudget;

    before(async () => {
        // deploy CommonsBudget
        const bugetFactory = await ethers.getContractFactory("CommonsBudget");
        budget = await bugetFactory.connect(budgetManager).deploy();
        await budget.deployed();

        // deploy VoteraVote
        const voteraVoteFactory = await ethers.getContractFactory("VoteraVote");
        voteraVote = await voteraVoteFactory.connect(voteManager).deploy();
        await voteraVote.deployed();
        voteAddress = voteraVote.address;

        // change parameter of voteraVote
        voteBudget = CommonsBudgetFactory.connect(budget.address, voteManager);

        await voteraVote.changeBudget(budget.address);

        // change parameter of budget
        const changeParamTx = await budget.changeVoteParam(voteManager.address, voteraVote.address);

        // send test eth to budget
        const transactionTx = await deployer.sendTransaction({
            to: budget.address,
            value: utils.parseEther("10.0"),
        });
        await transactionTx.wait();
    });

    beforeEach(async function () {
        // generate random proposal id (which is address type)
        proposal = getNewProposal();

        // get current blocktime and set vote basic parameter
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "Votera Vote Test";
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const docHash = getHash("bodyHash");
        const signProposal = await signSystemPropsal(voteManager, proposal, title, startTime, endTime, docHash);

        // make proposal data (by validator)
        const validatorBudget = CommonsBudgetFactory.connect(budget.address, validators[0]);
        const makeProposalTx = await validatorBudget.createSystemProposal(
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            signProposal,
            { value: basicFee }
        );
        await makeProposalTx.wait();
    });

    it("Check VoteraVote normal lifecycle", async function () {
        expect(await voteraVote.getManager()).to.be.equal(voteManager.address);
        const voteInfo = await voteraVote.voteInfos(proposal);
        expect(voteInfo.budget).equal(budget.address);

        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        displayBalance(voteManager.address, "init");

        // Setup Vote Information
        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");

        // Add Validator list for voter confirmation
        const addValidatorTx = await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );
        await addValidatorTx.wait();
        expect(await voteraVote.getValidatorCount(proposal)).equal(validators.length);

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        // prepare ballot
        const choices: number[] = [];
        const nonces: number[] = [];
        const expectVoteCounts: number[] = [0, 0, 0];
        const voterCount = validators.length - 1;

        for (let i = 0; i < voterCount; i += 1) {
            const c = i % 3;
            choices.push(c);
            nonces.push(i + 1);
            expectVoteCounts[c] += 1;
        }

        // submit ballot
        let submitBallotTx;
        for (let i = 0; i < voterCount; i += 1) {
            const commitment = await makeCommitment(
                voteAddress,
                proposal,
                validators[i].address,
                choices[i],
                nonces[i]
            );
            const signature = await signCommitment(voteManager, proposal, validators[i].address, commitment);

            const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[i]);
            submitBallotTx = await ballotVote.submitBallot(proposal, commitment, signature);
        }

        expect(await voteraVote.ballotCount(proposal)).equal(voterCount);

        if (submitBallotTx) {
            await submitBallotTx.wait();
        }

        // wait until endTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        // check read ballot information
        for (let i = 0; i < voterCount; i += 1) {
            const ballot = await voteraVote.getBallotAtIndex(proposal, i);
            expect(ballot.key).equal(validators[i].address);
        }

        // wait until openTime
        await network.provider.send("evm_increaseTime", [30]);
        await network.provider.send("evm_mine");

        // reveal ballot (by voteraServer)
        const keys1 = validators.map((v) => v.address).slice(0, 4);
        const choice1 = choices.slice(0, 4);
        const nonce1 = nonces.slice(0, 4);

        const revealTx1 = await voteraVote.revealBallot(proposal, keys1, choice1, nonce1);
        await revealTx1.wait();

        await expect(voteraVote.registerResult(proposal)).to.be.revertedWith("E002");

        const keys2 = validators.map((v) => v.address).slice(4, voterCount);
        const choice2 = choices.slice(4, voterCount);
        const nonce2 = nonces.slice(4, voterCount);

        await voteraVote.revealBallot(proposal, keys2, choice2, nonce2);

        const registerTx = await voteraVote.registerResult(proposal);
        await registerTx.wait();

        // check vote result
        const validatorCount = await voteraVote.getValidatorCount(proposal);
        const voteCounts = await voteraVote.getVoteCounts(proposal);
        for (let i = 0; i < 3; i += 1) {
            expect(voteCounts[i]).equal(expectVoteCounts[i]);
        }

        const finishVoteTx = await voteBudget.finishVote(proposal, validatorCount, voteCounts);
        await finishVoteTx.wait();

        displayBalance(voteManager.address, "end_");

        const proposalData = await voteBudget.getProposalData(proposal);
        expect(proposalData.validatorSize).equal(validatorCount);
        for (let i = 0; i < 3; i += 1) {
            expect(proposalData.voteCounts[i]).equal(BigNumber.from(voteCounts[i]));
        }
    });

    it("changeBudget", async () => {
        expect(await voteraVote.budget()).equal(budget.address);
    });

    it("changeBudget: Ownable: caller is not the owner", async () => {
        const invalidCaller = deployer;
        const invalidCallerVote = VoteraVoteFactory.connect(voteAddress, invalidCaller);
        await expect(invalidCallerVote.changeBudget(deployer.address)).to.be.revertedWith(
            "Ownable: caller is not the owner"
        );
    });

    it("changeBudget: E001", async () => {
        const invalidValue = AddressZero;
        await expect(voteraVote.changeBudget(invalidValue)).to.be.revertedWith("E001");
    });

    it("init: E000", async () => {
        const invalidCaller = deployer;
        const invalidCallerVote = VoteraVoteFactory.connect(voteAddress, invalidCaller);
        await expect(invalidCallerVote.init(proposal)).to.be.revertedWith("E000");
    });

    it("setupVoteInfo", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");

        const voteInfo = await voteraVote.voteInfos(proposal);
        expect(voteInfo.startVote).equals(startTime);
        expect(voteInfo.endVote).equals(endTime);
        expect(voteInfo.openVote).equals(openTime);
        expect(voteInfo.info).equals("info");
        expect(voteInfo.revealCount).equals(0);
        expect(voteInfo.finishVote).equals(false);
    });

    it("setupVoteInfo: Ownable: caller is not the owner", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        const invalidCaller = budgetManager;
        const invalidCallerVote = VoteraVoteFactory.connect(voteAddress, invalidCaller);
        await expect(
            invalidCallerVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info")
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("setupVoteInfo: E001", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await expect(
            voteraVote.setupVoteInfo(InvalidProposal, startTime, endTime, openTime, "info")
        ).to.be.revertedWith("E001");

        // block.timestamp < _startVote
        const invalidStartTime = blockLatest.timestamp - 100;
        await expect(
            voteraVote.setupVoteInfo(proposal, invalidStartTime, endTime, openTime, "info")
        ).to.be.revertedWith("E001");

        // 0 < _startVote && _startVote < _endVote && _endVote < _openVote
        const invalidEndTime = startTime - 100;
        await expect(
            voteraVote.setupVoteInfo(proposal, startTime, invalidEndTime, openTime, "info")
        ).to.be.revertedWith("E001");
        const invalidOpenTime = endTime - 100;
        await expect(
            voteraVote.setupVoteInfo(proposal, startTime, endTime, invalidOpenTime, "info")
        ).to.be.revertedWith("E001");
    });

    it("setupVoteInfo: E002", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");

        // call setupVoteInfo again
        await expect(voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info")).to.be.revertedWith(
            "E002"
        );
    });

    it("addValidators", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");

        await voteraVote.addValidators(
            proposal,
            validators.slice(0, 5).map((v) => v.address)
        );
        expect(await voteraVote.getValidatorCount(proposal)).equal(BigNumber.from(5));
        for (let i = 0; i < 5; i += 1) {
            expect(await voteraVote.getValidatorAt(proposal, i)).equal(validators[i].address);
        }

        await voteraVote.addValidators(
            proposal,
            validators.slice(3).map((v) => v.address)
        );
        expect(await voteraVote.getValidatorCount(proposal)).equal(BigNumber.from(validators.length));
        for (let i = 0; i < validators.length; i += 1) {
            expect(await voteraVote.getValidatorAt(proposal, i)).equal(validators[i].address);
        }
    });

    it("addValidators: Ownable: caller is not the owner", async () => {
        const invalidCaller = budgetManager;
        const invalidCallerVote = VoteraVoteFactory.connect(voteAddress, invalidCaller);
        await expect(
            invalidCallerVote.addValidators(
                proposal,
                validators.map((v) => v.address)
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("addValidators: E001", async () => {
        // call addValidators without init
        await expect(
            voteraVote.addValidators(
                InvalidProposal,
                validators.map((v) => v.address)
            )
        ).to.be.revertedWith("E001");
    });

    it("addValidators: E002", async () => {
        // call addvalidators without calling setupVoteInfo
        await expect(
            voteraVote.addValidators(
                proposal,
                validators.map((v) => v.address)
            )
        ).to.be.revertedWith("E002");
    });

    it("addValidators: E003", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        // call addValidators after voteStart
        await expect(
            voteraVote.addValidators(
                proposal,
                validators.map((v) => v.address)
            )
        ).to.be.revertedWith("E003");
    });

    it("submitBallot", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        const choice = 1;
        const nonce = 1;

        // validator[0]
        const commitment = await makeCommitment(voteAddress, proposal, validators[0].address, choice, nonce);
        const signature = await signCommitment(voteManager, proposal, validators[0].address, commitment);

        const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[0]);
        await ballotVote.submitBallot(proposal, commitment, signature);

        expect(await voteraVote.ballotCount(proposal)).equal(BigNumber.from(1));

        const ballot = await ballotVote.myBallot(proposal);
        expect(ballot.key).equal(validators[0].address);
        expect(ballot.choice).equal(BigNumber.from(0)); // not yet revealed
        expect(ballot.nonce).equal(BigNumber.from(0));
        expect(ballot.commitment).equal(commitment);

        // validator[1]
        const commitment1 = await makeCommitment(voteAddress, proposal, validators[1].address, choice, nonce);
        const signature1 = await signCommitment(voteManager, proposal, validators[1].address, commitment1);

        const ballotVote1 = VoteraVoteFactory.connect(voteAddress, validators[1]);
        await ballotVote1.submitBallot(proposal, commitment1, signature1);

        expect(await voteraVote.ballotCount(proposal)).equal(BigNumber.from(2));

        const ballot1 = await ballotVote1.myBallot(proposal);
        expect(ballot1.key).equal(validators[1].address);
        expect(ballot1.choice).equal(BigNumber.from(0));
        expect(ballot1.nonce).equal(BigNumber.from(0));
        expect(ballot1.commitment).equal(commitment1);

        // overwrite by validator[0]
        const newChoice = 2;
        const newNonce = 2;
        const newCommitment = await makeCommitment(voteAddress, proposal, validators[0].address, newChoice, newNonce);
        const newSignature = await signCommitment(voteManager, proposal, validators[0].address, newCommitment);

        await ballotVote.submitBallot(proposal, newCommitment, newSignature);

        // confirm ballotCount not changed
        expect(await voteraVote.ballotCount(proposal)).equal(BigNumber.from(2));
        const ballotChanged = await ballotVote.myBallot(proposal);
        expect(ballotChanged.key).equal(validators[0].address);
        expect(ballotChanged.choice).equal(BigNumber.from(0));
        expect(ballotChanged.nonce).equal(BigNumber.from(0));
        expect(ballotChanged.commitment).equal(newCommitment);
    });

    it("submitBallot: E001 - not found proposal", async () => {
        const choice = 1;
        const nonce = 1;

        // validator[0]
        const commitment = await makeCommitment(voteAddress, proposal, validators[0].address, choice, nonce);
        const signature = await signCommitment(voteManager, proposal, validators[0].address, commitment);

        const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[0]);
        await expect(ballotVote.submitBallot(InvalidProposal, commitment, signature)).to.be.revertedWith("E001"); // not found proposal
    });

    it("submitBallot: E002", async () => {
        const choice = 1;
        const nonce = 1;

        // validator[0]
        const commitment = await makeCommitment(voteAddress, proposal, validators[0].address, choice, nonce);
        const signature = await signCommitment(voteManager, proposal, validators[0].address, commitment);

        const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[0]);
        await expect(ballotVote.submitBallot(proposal, commitment, signature)).to.be.revertedWith("E002");
    });

    it("submitBallot: E000", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        const choice = 1;
        const nonce = 1;

        // validator[0]
        const commitment = await makeCommitment(voteAddress, proposal, validators[0].address, choice, nonce);
        const signature = await signCommitment(voteManager, proposal, validators[0].address, commitment);

        const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[0]);
        await ballotVote.submitBallot(proposal, commitment, signature);

        const invalidCaller = deployer;
        const commitmentOfInvalidCaller = await makeCommitment(
            voteAddress,
            proposal,
            invalidCaller.address,
            choice,
            nonce
        );
        const signatureOfInvalidCaller = await signCommitment(
            voteManager,
            proposal,
            invalidCaller.address,
            commitmentOfInvalidCaller
        );

        const invalidCallerVote = VoteraVoteFactory.connect(voteAddress, invalidCaller);
        await expect(
            invalidCallerVote.submitBallot(proposal, commitmentOfInvalidCaller, signatureOfInvalidCaller)
        ).to.be.revertedWith("E000");
    });

    it("submitBallot: E004", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        const choice = 1;
        const nonce = 1;

        // validator[0]
        const commitment = await makeCommitment(voteAddress, proposal, validators[0].address, choice, nonce);
        const signature = await signCommitment(voteManager, proposal, validators[0].address, commitment);

        const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[0]);
        await expect(ballotVote.submitBallot(proposal, commitment, signature)).to.be.revertedWith("E004");
    });

    it("submitBallot: E003", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        // wait until endTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        const choice = 1;
        const nonce = 1;

        // validator[0]
        const commitment = await makeCommitment(voteAddress, proposal, validators[0].address, choice, nonce);
        const signature = await signCommitment(voteManager, proposal, validators[0].address, commitment);

        const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[0]);
        await expect(ballotVote.submitBallot(proposal, commitment, signature)).to.be.revertedWith("E003");
    });

    it("submitBallot: E001 - verifySubmit failed", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        const choice = 1;
        const nonce = 1;

        // validator[0]
        const commitment = await makeCommitment(voteAddress, proposal, validators[0].address, choice, nonce);
        const signature = await signCommitment(voteManager, proposal, validators[0].address, commitment);

        const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[0]);

        const invalidCaller = validators[1];
        const invalidCallerVote = VoteraVoteFactory.connect(voteAddress, invalidCaller);
        await expect(invalidCallerVote.submitBallot(proposal, commitment, signature)).to.be.revertedWith("E001");

        const invalidSigner = budgetManager;
        const invalidSignature = await signCommitment(invalidSigner, proposal, validators[0].address, commitment);
        await expect(ballotVote.submitBallot(proposal, commitment, invalidSignature)).to.be.revertedWith("E001");
    });

    it("getBallotAtIndex", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        const commitments: string[] = [];
        const voteCount = 2;

        for (let i = 0; i < voteCount; i += 1) {
            const choice = i % 3;
            const nonce = i + 1;
            const commitment = await makeCommitment(voteAddress, proposal, validators[i].address, choice, nonce);
            const signature = await signCommitment(voteManager, proposal, validators[i].address, commitment);

            commitments.push(commitment);

            const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[i]);
            await ballotVote.submitBallot(proposal, commitment, signature);
        }

        // wait until endTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        expect(await voteraVote.ballotCount(proposal)).equal(BigNumber.from(voteCount));

        for (let i = 0; i < voteCount; i += 1) {
            const ballot = await voteraVote.getBallotAtIndex(proposal, i);
            expect(ballot.key).equal(validators[i].address);
            expect(ballot.choice).equal(BigNumber.from(0));
            expect(ballot.nonce).equal(BigNumber.from(0));
            expect(ballot.commitment).equal(commitments[i]);
        }
    });

    it("getBallotAtIndex: E001", async () => {
        await expect(voteraVote.getBallotAtIndex(InvalidProposal, 0)).to.be.revertedWith("E001"); // not found proposal
        // call without setupVoteInfo
        await expect(voteraVote.getBallotAtIndex(proposal, 0)).to.be.revertedWith("E001");

        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        const commitments: string[] = [];
        const voteCount = 2;

        for (let i = 0; i < voteCount; i += 1) {
            const choice = i % 3;
            const nonce = i + 1;
            const commitment = await makeCommitment(voteAddress, proposal, validators[i].address, choice, nonce);
            const signature = await signCommitment(voteManager, proposal, validators[i].address, commitment);

            commitments.push(commitment);

            const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[i]);
            await ballotVote.submitBallot(proposal, commitment, signature);
        }

        // wait until endTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        expect(await voteraVote.ballotCount(proposal)).equal(BigNumber.from(voteCount));

        const ballot = await voteraVote.getBallotAtIndex(proposal, 0);
        expect(ballot.key).equal(validators[0].address);
        expect(ballot.commitment).equal(commitments[0]);

        const invalidInput = 3;
        await expect(voteraVote.getBallotAtIndex(proposal, invalidInput)).to.be.revertedWith("E001");
    });

    it("getBallotAtIndex: E004", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        const commitments: string[] = [];
        const voteCount = 2;

        for (let i = 0; i < voteCount; i += 1) {
            const choice = i % 3;
            const nonce = i + 1;
            const commitment = await makeCommitment(voteAddress, proposal, validators[i].address, choice, nonce);
            const signature = await signCommitment(voteManager, proposal, validators[i].address, commitment);

            commitments.push(commitment);

            const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[i]);
            await ballotVote.submitBallot(proposal, commitment, signature);
        }

        await expect(voteraVote.getBallotAtIndex(proposal, 0)).to.be.revertedWith("E004");
    });

    it("revealBallot", async () => {
        // prepare ballot
        const voterCount = 2;
        const keys: string[] = validators.slice(0, voterCount).map((v) => v.address);
        const choices: number[] = [];
        const nonces: number[] = [];
        const commitments: string[] = [];

        for (let i = 0; i < voterCount; i += 1) {
            const choice = i % 3;
            const nonce = i + 1;
            const commitment = await makeCommitment(voteAddress, proposal, validators[i].address, choice, nonce);

            choices.push(choice);
            nonces.push(nonce);
            commitments.push(commitment);
        }

        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        for (let i = 0; i < voterCount; i += 1) {
            const signature = await signCommitment(voteManager, proposal, validators[i].address, commitments[i]);
            const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[i]);
            await ballotVote.submitBallot(proposal, commitments[i], signature);
        }

        // wait until endTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        expect(await voteraVote.ballotCount(proposal)).equal(BigNumber.from(voterCount));

        // wait until openTime
        await network.provider.send("evm_increaseTime", [30]);
        await network.provider.send("evm_mine");

        await voteraVote.revealBallot(proposal, keys, choices, nonces);

        for (let i = 0; i < voterCount; i += 1) {
            const ballot = await voteraVote.getBallotAtIndex(proposal, i);
            expect(ballot.key).equal(validators[i].address);
            expect(ballot.choice).equal(BigNumber.from(choices[i]));
            expect(ballot.nonce).equal(BigNumber.from(nonces[i]));
            expect(ballot.commitment).equal(commitments[i]);
        }
    });

    it("revealBallot: Ownable: caller is not the owner", async () => {
        const keys = validators.map((v) => v.address);
        const choices = validators.map((v, i) => i % 3);
        const nonces = validators.map((v, i) => i + 1);

        const invalidCaller = budgetManager;
        const invalidCallerVote = VoteraVoteFactory.connect(voteAddress, invalidCaller);
        await expect(invalidCallerVote.revealBallot(proposal, keys, choices, nonces)).to.be.revertedWith(
            "Ownable: caller is not the owner"
        );
    });

    it("revealBallot: E001", async () => {
        // prepare ballot
        const voterCount = 2;
        const keys: string[] = validators.slice(0, voterCount).map((v) => v.address);
        const choices: number[] = [];
        const nonces: number[] = [];
        const commitments: string[] = [];

        for (let i = 0; i < voterCount; i += 1) {
            const choice = i % 3;
            const nonce = i + 1;
            const commitment = await makeCommitment(voteAddress, proposal, validators[i].address, choice, nonce);

            choices.push(choice);
            nonces.push(nonce);
            commitments.push(commitment);
        }

        await expect(voteraVote.revealBallot(InvalidProposal, keys, choices, nonces)).to.be.revertedWith("E001"); // not found proposal

        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        for (let i = 0; i < voterCount; i += 1) {
            const signature = await signCommitment(voteManager, proposal, validators[i].address, commitments[i]);
            const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[i]);
            await ballotVote.submitBallot(proposal, commitments[i], signature);
        }

        // wait until endTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        expect(await voteraVote.ballotCount(proposal)).equal(BigNumber.from(voterCount));

        // wait until openTime
        await network.provider.send("evm_increaseTime", [30]);
        await network.provider.send("evm_mine");

        const invalidChoicesSize = choices.slice(1);
        await expect(voteraVote.revealBallot(proposal, keys, invalidChoicesSize, nonces)).to.be.revertedWith("E001");
        const invalidNoncesSize = nonces.slice(1);
        await expect(voteraVote.revealBallot(proposal, keys, choices, invalidNoncesSize)).to.be.revertedWith("E001");

        const invalidNoncesZero = nonces.map((o, i) => (i === 0 ? 0 : o));
        await expect(voteraVote.revealBallot(proposal, keys, choices, invalidNoncesZero)).to.be.revertedWith("E001");

        const invalidChoicesCommitment = choices.map((c, i) => (i === 1 ? c + 1 : c));
        await expect(voteraVote.revealBallot(proposal, keys, invalidChoicesCommitment, nonces)).to.be.revertedWith(
            "E001"
        );

        const invalidNoncesCommitment = nonces.map((o, i) => (i === 0 ? o + 1 : o));
        await expect(voteraVote.revealBallot(proposal, keys, choices, invalidNoncesCommitment)).to.be.revertedWith(
            "E001"
        );
    });

    it("revealBallot: E002", async () => {
        // prepare ballot
        const voterCount = 2;
        const keys: string[] = validators.slice(0, voterCount).map((v) => v.address);
        const choices: number[] = [];
        const nonces: number[] = [];
        const commitments: string[] = [];

        for (let i = 0; i < voterCount; i += 1) {
            const choice = i % 3;
            const nonce = i + 1;
            const commitment = await makeCommitment(voteAddress, proposal, validators[i].address, choice, nonce);

            choices.push(choice);
            nonces.push(nonce);
            commitments.push(commitment);
        }

        await expect(voteraVote.revealBallot(proposal, keys, choices, nonces)).to.be.revertedWith("E002"); // call without setupVoteInfo

        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        for (let i = 0; i < voterCount; i += 1) {
            const signature = await signCommitment(voteManager, proposal, validators[i].address, commitments[i]);
            const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[i]);
            await ballotVote.submitBallot(proposal, commitments[i], signature);
        }

        // wait until endTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        expect(await voteraVote.ballotCount(proposal)).equal(BigNumber.from(voterCount));

        // wait until openTime
        await network.provider.send("evm_increaseTime", [30]);
        await network.provider.send("evm_mine");

        await voteraVote.revealBallot(proposal, keys, choices, nonces);

        await voteraVote.registerResult(proposal);

        // already called registerResult
        await expect(voteraVote.revealBallot(proposal, keys, choices, nonces)).to.be.revertedWith("E002");
    });

    it("revealBallot: E004", async () => {
        // prepare ballot
        const voterCount = 2;
        const keys: string[] = validators.slice(0, voterCount).map((v) => v.address);
        const choices: number[] = [];
        const nonces: number[] = [];
        const commitments: string[] = [];

        for (let i = 0; i < voterCount; i += 1) {
            const choice = i % 3;
            const nonce = i + 1;
            const commitment = await makeCommitment(voteAddress, proposal, validators[i].address, choice, nonce);

            choices.push(choice);
            nonces.push(nonce);
            commitments.push(commitment);
        }

        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        await expect(voteraVote.revealBallot(proposal, keys, choices, nonces)).to.be.revertedWith("E004");
    });

    it("registerResult&getVoteCounts", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        const voterCount = 5;
        const keys = validators.slice(0, voterCount).map((v) => v.address);
        const choices: number[] = [];
        const nonces: number[] = [];
        const commitments: string[] = [];
        const expectVoteCounts: number[] = [0, 0, 0];

        for (let i = 0; i < voterCount; i += 1) {
            const choice = i % 3;
            const nonce = i + 1;
            const commitment = await makeCommitment(voteAddress, proposal, validators[i].address, choice, nonce);
            const signature = await signCommitment(voteManager, proposal, validators[i].address, commitment);

            choices.push(choice);
            nonces.push(nonce);
            expectVoteCounts[choice] += 1;
            commitments.push(commitment);

            const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[i]);
            await ballotVote.submitBallot(proposal, commitment, signature);
        }

        // wait until endTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        expect(await voteraVote.ballotCount(proposal)).equal(BigNumber.from(voterCount));

        // wait until openTime
        await network.provider.send("evm_increaseTime", [30]);
        await network.provider.send("evm_mine");

        await voteraVote.revealBallot(proposal, keys, choices, nonces);

        await voteraVote.registerResult(proposal);

        const voteCounts = await voteraVote.getVoteCounts(proposal);
        expect(voteCounts.length).equal(3);
        for (let i = 0; i < 3; i += 1) {
            expect(voteCounts[i]).equal(expectVoteCounts[i]);
        }
    });

    it("registerResult&getVoteCounts - no voter", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        // wait until endTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        expect(await voteraVote.ballotCount(proposal)).equal(BigNumber.from(0));

        // wait until openTime
        await network.provider.send("evm_increaseTime", [30]);
        await network.provider.send("evm_mine");

        await voteraVote.registerResult(proposal);

        const voteCounts = await voteraVote.getVoteCounts(proposal);
        expect(voteCounts.length).equal(3);
        for (let i = 0; i < 3; i += 1) {
            expect(voteCounts[i]).equal(BigNumber.from(0));
        }
    });

    it("registerResult: Ownable: caller is not the owner", async () => {
        const invalidCaller = budgetManager;
        const invalidCallerVote = VoteraVoteFactory.connect(voteAddress, invalidCaller);
        await expect(invalidCallerVote.registerResult(proposal)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("registerResult: E001", async () => {
        await expect(voteraVote.registerResult(InvalidProposal)).to.be.revertedWith("E001");
    });

    it("registerResult: E002 - not initialized && duplicated call", async () => {
        await expect(voteraVote.registerResult(proposal)).to.be.revertedWith("E002"); // not initialized

        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        const voterCount = 5;
        const keys = validators.slice(0, voterCount).map((v) => v.address);
        const choices: number[] = [];
        const nonces: number[] = [];
        const commitments: string[] = [];
        const expectVoteCounts: number[] = [0, 0, 0];

        for (let i = 0; i < voterCount; i += 1) {
            const choice = i % 3;
            const nonce = i + 1;
            const commitment = await makeCommitment(voteAddress, proposal, validators[i].address, choice, nonce);
            const signature = await signCommitment(voteManager, proposal, validators[i].address, commitment);

            choices.push(choice);
            nonces.push(nonce);
            expectVoteCounts[choice] += 1;
            commitments.push(commitment);

            const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[i]);
            await ballotVote.submitBallot(proposal, commitment, signature);
        }

        // wait until endTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        expect(await voteraVote.ballotCount(proposal)).equal(BigNumber.from(voterCount));

        // wait until openTime
        await network.provider.send("evm_increaseTime", [30]);
        await network.provider.send("evm_mine");

        await voteraVote.revealBallot(proposal, keys, choices, nonces);

        await voteraVote.registerResult(proposal);

        await expect(voteraVote.registerResult(proposal)).to.be.revertedWith("E002"); // duplicated call
    });

    it("registerResult: E002 - not revealed", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        const voterCount = 5;
        const keys = validators.slice(0, voterCount).map((v) => v.address);
        const choices: number[] = [];
        const nonces: number[] = [];
        const commitments: string[] = [];
        const expectVoteCounts: number[] = [0, 0, 0];

        for (let i = 0; i < voterCount; i += 1) {
            const choice = i % 3;
            const nonce = i + 1;
            const commitment = await makeCommitment(voteAddress, proposal, validators[i].address, choice, nonce);
            const signature = await signCommitment(voteManager, proposal, validators[i].address, commitment);

            choices.push(choice);
            nonces.push(nonce);
            expectVoteCounts[choice] += 1;
            commitments.push(commitment);

            const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[i]);
            await ballotVote.submitBallot(proposal, commitment, signature);
        }

        // wait until endTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        expect(await voteraVote.ballotCount(proposal)).equal(BigNumber.from(voterCount));

        // wait until openTime
        await network.provider.send("evm_increaseTime", [30]);
        await network.provider.send("evm_mine");

        await expect(voteraVote.registerResult(proposal)).to.be.revertedWith("E002");

        const notYetKeys = keys.slice(1);
        const notYetChoices = choices.slice(1);
        const notYetNonces = nonces.slice(1);

        await voteraVote.revealBallot(proposal, notYetKeys, notYetChoices, notYetNonces);

        await expect(voteraVote.registerResult(proposal)).to.be.revertedWith("E002");
    });

    it("registerResult: E004", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        await expect(voteraVote.registerResult(proposal)).to.be.revertedWith("E004");
    });

    it("getVoteCounts: E001", async () => {
        await expect(voteraVote.getVoteCounts(InvalidProposal)).to.be.revertedWith("E001");
    });

    it("getVoteCounts: E002", async () => {
        await expect(voteraVote.getVoteCounts(proposal)).to.be.revertedWith("E002"); // call without setupVoteInfo

        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 86400; // 1 day
        const endTime = startTime + 86400; // 1 day
        const openTime = endTime + 30;

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address)
        );

        await expect(voteraVote.getVoteCounts(proposal)).to.be.revertedWith("E002");

        // wait until startTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        // wait until endTime
        await network.provider.send("evm_increaseTime", [86400]);
        await network.provider.send("evm_mine");

        expect(await voteraVote.ballotCount(proposal)).equal(BigNumber.from(0));

        // wait until openTime
        await network.provider.send("evm_increaseTime", [30]);
        await network.provider.send("evm_mine");

        await expect(voteraVote.getVoteCounts(proposal)).to.be.revertedWith("E002"); // call without registerResult
    });
});
