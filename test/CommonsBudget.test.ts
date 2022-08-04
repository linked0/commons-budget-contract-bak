import chai, { expect } from "chai";
import crypto from "crypto";
import { solidity } from "ethereum-waffle";
import { BigNumber, utils, Wallet } from "ethers";
import { ethers, network, waffle } from "hardhat";
import {
    CommonsBudget,
    CommonsBudget__factory as CommonsBudgetFactory,
    VoteraVote,
    VoteraVote__factory as VoteraVoteFactory,
} from "../typechain";
import { makeCommitment, signCommitment, signFundProposal, signSystemProposal } from "./VoteHelper";

import * as assert from "assert";

const AddressZero = "0x0000000000000000000000000000000000000000";
const AddressNormal = "0xcD958D25697A04B0e55BF13c5ADE051beE046354";
const DocHash = "0x9f18669085971c1306dd0096ec531e71ad2732fd0e783068f2a3aba628613231";

chai.use(solidity);

describe("Test of Commons Budget Contract", () => {
    let contract: CommonsBudget;
    let voteraVote: VoteraVote;

    const basicFee = ethers.utils.parseEther("100.0");
    const fundAmount = ethers.utils.parseEther("10000.0");

    const provider = waffle.provider;
    const [admin, voteManager, ...validators] = provider.getWallets();
    // set 1 million BOA for CommonsBudget contract
    const commonsFund = BigNumber.from(10).pow(18).mul(1000000);
    const admin_signer = provider.getSigner(admin.address);

    let proposal: string;

    let wrongSigner: Wallet;

    before(async () => {
        const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
        contract = (await commonsBudgetFactory.deploy()) as CommonsBudget;
        await contract.deployed();

        const voteraVoteFactory = await ethers.getContractFactory("VoteraVote");
        voteraVote = await voteraVoteFactory.connect(voteManager).deploy();
        await voteraVote.deployed();
        await voteraVote.changeCommonBudgetContract(contract.address);

        const voteAddress = voteraVote.address;
        const changeParamTx = await contract.changeVoteParam(voteManager.address, voteAddress);
        await changeParamTx.wait();
    });

    beforeEach(() => {
        proposal = `0x${crypto.randomBytes(32).toString("hex")}`;
    });

    it("Not Enough Commons Budget Fund", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "FundProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const proposer = validators[0].address;
        const signProposal = await signFundProposal(
            voteManager,
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer
        );

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        await expect(
            validatorBudget.createFundProposal(
                proposal,
                title,
                startTime,
                endTime,
                DocHash,
                fundAmount,
                validators[0].address,
                signProposal,
                { value: basicFee }
            )
        ).to.be.revertedWith("NotEnoughBudget");
    });

    it("Send", async () => {
        await provider.getSigner(admin.address).sendTransaction({
            to: contract.address,
            value: commonsFund,
        });
    });

    it("Check", async () => {
        const balance = await provider.getBalance(contract.address);
        assert.deepStrictEqual(balance, commonsFund);
    });

    it("Check Proposal Fee", async () => {
        const fundProposalFee = await contract.getFundProposalFeePermil();
        assert.deepStrictEqual(fundProposalFee.toString(), "10");
        const systemProposalFe = await contract.getSystemProposalFee();
        assert.deepStrictEqual(systemProposalFe.toString(), "100000000000000000000");
    });

    it("Set Proposal Fee", async () => {
        const originalFeePermil = await contract.getFundProposalFeePermil();
        const originalProposalFee = await contract.getSystemProposalFee();

        await contract.connect(admin_signer).setFundProposalFeePermil(20);
        await contract.connect(admin_signer).setSystemProposalFee(BigNumber.from(500).mul(BigNumber.from(10).pow(18)));

        const fundProposalFee = await contract.getFundProposalFeePermil();
        assert.deepStrictEqual(fundProposalFee.toString(), "20");
        const systemProposalFe = await contract.getSystemProposalFee();
        assert.deepStrictEqual(systemProposalFe.toString(), "500000000000000000000");

        await contract.connect(admin_signer).setFundProposalFeePermil(originalFeePermil);
        await contract.connect(admin_signer).setSystemProposalFee(originalProposalFee);
    });

    it("Check Quorum Factor", async () => {
        const factor = await contract.getVoteQuorumFactor();
        assert.deepStrictEqual(factor, 333333);
    });

    it("Set Quorum Factor", async () => {
        await contract.connect(admin_signer).setVoteQuorumFactor(200000);
        const factor = await contract.getVoteQuorumFactor();
        assert.deepStrictEqual(factor, 200000);
    });

    it("Check Voter Fee", async () => {
        const voterFee = await contract.getVoterFee();
        assert.deepStrictEqual(voterFee.toNumber(), 200000000000000);
    });

    it("Set Voter Fee", async () => {
        await contract.connect(admin_signer).setVoterFee(300000000000000);
        const voterFee = await contract.getVoterFee();
        assert.deepStrictEqual(voterFee.toNumber(), 300000000000000);
    });

    it("changeVoteParam", async () => {
        const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
        const testContract = (await commonsBudgetFactory.deploy()) as CommonsBudget;
        await testContract.deployed();

        await testContract.changeVoteParam(admin.address, contract.address);
        expect(await testContract.voteManager()).equal(admin.address);
        expect(await testContract.voteAddress()).equal(contract.address);
    });

    it("changeVoteParam: Ownable: caller is not the owner", async () => {
        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteManager);
        await expect(voteBudget.changeVoteParam(validators[0].address, AddressNormal)).to.be.revertedWith(
            "Ownable: caller is not the owner"
        );
    });

    it("changeVoteParam: InvalidInput", async () => {
        await expect(contract.changeVoteParam(AddressZero, AddressNormal)).to.be.revertedWith("InvalidInput");
        await expect(contract.changeVoteParam(AddressNormal, AddressZero)).to.be.revertedWith("InvalidInput");
    });

    it("createSystemProposal", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "SystemProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const signProposal = await signSystemProposal(voteManager, proposal, title, startTime, endTime, docHash);

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
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

        const proposalData = await contract.getProposalData(proposal);
        expect(proposalData.state).equal(1); // CREATED state
        expect(proposalData.proposalType).equal(0); // SYSTEM type
        expect(proposalData.title).equal("SystemProposalTitle");
        expect(proposalData.start).equal(startTime);
        expect(proposalData.end).equal(endTime);
        expect(proposalData.docHash).equal(docHash);
        expect(proposalData.fundAmount).equal(BigNumber.from(0));
        expect(proposalData.proposer).equal(validators[0].address);
        expect(proposalData.validatorSize).equal(BigNumber.from(0));

        expect(await contract.getProposalValues(proposal)).equal(basicFee);

        // make sure proposal is initialized in voteraVote
        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteManager);
        const voteAddress = (await voteBudget.getProposalData(proposal)).voteAddress;
        expect(voteAddress).equal(voteraVote.address);

        const voteInfo = await voteraVote.voteInfos(proposal);
        expect(voteInfo.commonsBudgetAddress).equal(contract.address);
    });

    it("createSystemProposal: InvalidFee", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "SystemProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const signProposal = await signSystemProposal(voteManager, proposal, title, startTime, endTime, docHash);

        // call without fee
        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        await expect(
            validatorBudget.createSystemProposal(proposal, title, startTime, endTime, docHash, signProposal)
        ).to.be.revertedWith("InvalidFee");
    });

    it("createSystemProposal: InvalidInput - (startTime, endTime)", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "SystemProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const signProposal = await signSystemProposal(voteManager, proposal, title, startTime, endTime, docHash);

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const wrongStartTime = 0;
        await expect(
            validatorBudget.createSystemProposal(proposal, title, wrongStartTime, endTime, docHash, signProposal, {
                value: basicFee,
            })
        ).to.be.revertedWith("InvalidInput");
        const wrongEndTime = startTime - 100;
        await expect(
            validatorBudget.createSystemProposal(proposal, title, startTime, wrongEndTime, docHash, signProposal, {
                value: basicFee,
            })
        ).to.be.revertedWith("InvalidInput");
    });

    it("createSystemProposal: AlreadyExistProposal", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "SystemProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const signProposal = await signSystemProposal(voteManager, proposal, title, startTime, endTime, docHash);

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        await validatorBudget.createSystemProposal(proposal, title, startTime, endTime, docHash, signProposal, {
            value: basicFee,
        });

        // call again with same proposal
        await expect(
            validatorBudget.createSystemProposal(proposal, title, startTime, endTime, docHash, signProposal, {
                value: basicFee,
            })
        ).to.be.revertedWith("AlreadyExistProposal");
    });

    it("createSystemProposal: InvalidInput - without initializing", async () => {
        const newFactory = await ethers.getContractFactory("CommonsBudget");
        const newContract = (await newFactory.deploy()) as CommonsBudget;
        await newContract.deployed();

        const title = "SystemProposalTitle";
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const signProposal = await signSystemProposal(voteManager, proposal, title, startTime, endTime, docHash);

        // call createSystemProposal without initializing changeVoteParam of contract
        const validatorBudget = CommonsBudgetFactory.connect(newContract.address, validators[0]);
        await expect(
            validatorBudget.createSystemProposal(proposal, title, startTime, endTime, docHash, signProposal, {
                value: basicFee,
            })
        ).to.be.revertedWith("InvalidInput");
    });

    it("createSystemProposal: InvalidInput - invalid signature", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "SystemProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const signProposal = await signSystemProposal(voteManager, proposal, title, startTime, endTime, docHash);

        const wrongTitle = "WrongProposalTitle";

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        await expect(
            validatorBudget.createSystemProposal(proposal, wrongTitle, startTime, endTime, docHash, signProposal, {
                value: basicFee,
            })
        ).to.be.revertedWith("InvalidInput");

        wrongSigner = admin;
        const wrongSignProposal = await signSystemProposal(wrongSigner, proposal, title, startTime, endTime, docHash);
        await expect(
            validatorBudget.createSystemProposal(proposal, title, startTime, endTime, docHash, wrongSignProposal, {
                value: basicFee,
            })
        ).to.be.revertedWith("InvalidInput");
    });

    it("createFundProposal", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "FundProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const proposer = validators[0].address;
        const signProposal = await signFundProposal(
            voteManager,
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer
        );

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.createFundProposal(
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            signProposal,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const proposalData = await contract.getProposalData(proposal);
        expect(proposalData.state).equal(1); // CREATE state
        expect(proposalData.proposalType).equal(1); // FUND type
        expect(proposalData.title).equal("FundProposalTitle");
        expect(proposalData.start).equal(startTime);
        expect(proposalData.end).equal(endTime);
        expect(proposalData.docHash).equal(docHash);
        expect(proposalData.fundAmount).equal(fundAmount);
        expect(proposalData.proposer).equal(proposer);
        expect(proposalData.validatorSize).equal(BigNumber.from(0));

        expect(await contract.getProposalValues(proposal)).equal(basicFee);

        // make sure proposal is initialized in voteraVote
        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteManager);
        const voteAddress = (await voteBudget.getProposalData(proposal)).voteAddress;
        expect(voteAddress).equal(voteraVote.address);

        const voteInfo = await voteraVote.voteInfos(proposal);
        expect(voteInfo.commonsBudgetAddress).equal(contract.address);
    });

    it("createFundProposal: InvalidFee (NoFee)", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "FundProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const proposer = validators[0].address;
        const signProposal = await signFundProposal(
            voteManager,
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer
        );

        // call without fee
        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        await expect(
            validatorBudget.createFundProposal(
                proposal,
                title,
                startTime,
                endTime,
                docHash,
                fundAmount,
                proposer,
                signProposal
            )
        ).to.be.revertedWith("InvalidFee");
    });

    it("createFundProposal: InvalidFee (SmallFee)", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "FundProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const proposer = validators[0].address;
        const feePermil = await contract.getFundProposalFeePermil();
        const wantedFee = fundAmount.mul(feePermil).div(1000);
        const wrongFee = wantedFee.div(2);
        const signProposal = await signFundProposal(
            voteManager,
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer
        );

        // call without fee
        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        await expect(
            validatorBudget.createFundProposal(
                proposal,
                title,
                startTime,
                endTime,
                docHash,
                fundAmount,
                proposer,
                signProposal,
                { value: wrongFee }
            )
        ).to.be.revertedWith("InvalidFee");
    });

    it("createFundProposal: InvalidSender", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "FundProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const wrongProposer = validators[1].address;
        const signProposal = await signFundProposal(
            voteManager,
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            fundAmount,
            wrongProposer
        );

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        await expect(
            validatorBudget.createFundProposal(
                proposal,
                title,
                startTime,
                endTime,
                docHash,
                fundAmount,
                wrongProposer,
                signProposal,
                { value: basicFee }
            )
        ).to.be.revertedWith("InvalidSender");
    });

    it("createFundProposal: InvalidInput", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "FundProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const wrongStartTime = 0;
        const signWrongStartTime = await signFundProposal(
            voteManager,
            proposal,
            title,
            wrongStartTime,
            endTime,
            docHash,
            fundAmount,
            proposer
        );
        await expect(
            validatorBudget.createFundProposal(
                proposal,
                title,
                wrongStartTime,
                endTime,
                docHash,
                fundAmount,
                proposer,
                signWrongStartTime,
                { value: basicFee }
            )
        ).to.be.revertedWith("InvalidInput");
        const wrongEndTime = startTime - 100;
        const signWrongEndTime = await signFundProposal(
            voteManager,
            proposal,
            title,
            startTime,
            wrongEndTime,
            docHash,
            fundAmount,
            proposer
        );
        await expect(
            validatorBudget.createFundProposal(
                proposal,
                title,
                startTime,
                wrongEndTime,
                docHash,
                fundAmount,
                proposer,
                signWrongEndTime,
                { value: basicFee }
            )
        ).to.be.revertedWith("InvalidInput");
    });

    it("createFundProposal: AlreadyExistProposal", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "FundProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const proposer = validators[0].address;
        const signProposal = await signFundProposal(
            voteManager,
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer
        );

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        await validatorBudget.createFundProposal(
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            signProposal,
            { value: basicFee }
        );

        // call again with same proposal
        await expect(
            validatorBudget.createFundProposal(
                proposal,
                title,
                startTime,
                endTime,
                docHash,
                fundAmount,
                proposer,
                signProposal,
                { value: basicFee }
            )
        ).to.be.revertedWith("AlreadyExistProposal");
    });

    it("createFundProposal: InvalidInput - without initializing", async () => {
        const newFactory = await ethers.getContractFactory("CommonsBudget");
        const newContract = (await newFactory.deploy()) as CommonsBudget;
        await newContract.deployed();

        // send 100,000 BOA from `admin` to the new CommonsBudget contract
        const newAmount = BigNumber.from(10).pow(18).mul(100000);
        await provider.getSigner(admin.address).sendTransaction({
            to: newContract.address,
            value: newAmount,
        });

        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "FundProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const proposer = validators[0].address;
        const signProposal = await signFundProposal(
            voteManager,
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer
        );

        // call createFundProposal without initializing changeVoteParam of contract

        const validatorBudget = CommonsBudgetFactory.connect(newContract.address, validators[0]);
        await expect(
            validatorBudget.createFundProposal(
                proposal,
                title,
                startTime,
                endTime,
                docHash,
                fundAmount,
                proposer,
                signProposal,
                { value: basicFee }
            )
        ).to.be.revertedWith("InvalidInput");
    });

    it("createFundProposal: InvalidInput - invalid proposal signature", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "FundProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const proposer = validators[0].address;
        const signProposal = await signFundProposal(
            voteManager,
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer
        );

        const wrongTitle = "WrongProposalTitle";

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        await expect(
            validatorBudget.createFundProposal(
                proposal,
                wrongTitle,
                startTime,
                endTime,
                docHash,
                fundAmount,
                proposer,
                signProposal,
                { value: basicFee }
            )
        ).to.be.revertedWith("InvalidInput");

        wrongSigner = admin;
        const wrongSignProposal = await signFundProposal(
            wrongSigner,
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer
        );
        await expect(
            validatorBudget.createFundProposal(
                proposal,
                title,
                startTime,
                endTime,
                docHash,
                fundAmount,
                proposer,
                wrongSignProposal,
                { value: basicFee }
            )
        ).to.be.revertedWith("InvalidInput");
    });

    const recordVote = async (voteAddress: string, countVote: boolean): Promise<number[]> => {
        const proposalData = await contract.getProposalData(proposal);
        const startTime = proposalData.start;
        const endTime = proposalData.end;
        const openTime = endTime.add(30);

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposal,
            validators.map((v) => v.address),
            true
        );

        // wait until startTime
        await network.provider.send("evm_increaseTime", [30000]);
        await network.provider.send("evm_mine");

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

        expect(await voteraVote.getBallotCount(proposal)).equal(voterCount);

        if (submitBallotTx) {
            await submitBallotTx.wait();
        }

        if (!countVote) {
            return expectVoteCounts;
        }

        await network.provider.send("evm_increaseTime", [30000]);
        await network.provider.send("evm_mine");

        for (let i = 0; i < voterCount; i += 1) {
            const ballot = await voteraVote.getBallotAt(proposal, i);
            expect(ballot.key).equal(validators[i].address);
        }

        // wait until openTime
        await network.provider.send("evm_increaseTime", [30]);
        await network.provider.send("evm_mine");

        await voteraVote.revealBallot(
            proposal,
            validators.slice(0, voterCount).map((v) => v.address),
            choices,
            nonces
        );
        await voteraVote.countVote(proposal);

        return expectVoteCounts;
    };

    it("finishVote: NotExistProposal", async () => {
        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteManager);
        const validatorCount = 9;
        await expect(voteBudget.finishVote(proposal, validatorCount, [3, 3, 3])).to.be.revertedWith("NotExistProposal");
    });

    it("finishVote: AlreadyFinishedProposal", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "FundProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const proposer = validators[0].address;
        const signProposal = await signFundProposal(
            voteManager,
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer
        );

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.createFundProposal(
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            signProposal,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const voteAddress = (await contract.getProposalData(proposal)).voteAddress;
        const expectVoteCounts = await recordVote(voteAddress, true);

        const validatorCount = await voteraVote.getValidatorCount(proposal);
        const voteResult = await voteraVote.getVoteResult(proposal);

        for (let i = 0; i < 3; i += 1) {
            expect(voteResult[i]).equal(BigNumber.from(expectVoteCounts[i]));
        }

        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteManager);
        await expect(
            voteBudget.finishVote(proposal, validatorCount, [voteResult[0], voteResult[1], voteResult[2]])
        ).to.be.revertedWith("AlreadyFinishedProposal");
    });

    it("finishVote: NotEndProposal", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "FUndProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const newFundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;
        const signProposal = await signFundProposal(
            voteManager,
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            newFundAmount,
            proposer
        );

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.createFundProposal(
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            newFundAmount,
            proposer,
            signProposal,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const voteAddress = (await contract.getProposalData(proposal)).voteAddress;
        const expectVoteCounts = await recordVote(voteAddress, false);

        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteManager);
        const validatorCount = 9;
        await expect(voteBudget.finishVote(proposal, validatorCount, [3, 3, 3])).to.be.revertedWith("NotEndProposal");
    });

    it("finishVote: NotAuthorized", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "FundProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const newFundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;
        const signProposal = await signFundProposal(
            voteManager,
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            newFundAmount,
            proposer
        );

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.createFundProposal(
            proposal,
            title,
            startTime,
            endTime,
            docHash,
            newFundAmount,
            proposer,
            signProposal,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const voteAddress = (await contract.getProposalData(proposal)).voteAddress;
        const expectVoteCounts = await recordVote(voteAddress, false);

        // wait for endTime
        await network.provider.send("evm_increaseTime", [30000]);
        await network.provider.send("evm_mine");

        // wait for openTime
        await network.provider.send("evm_increaseTime", [30]);
        await network.provider.send("evm_mine");

        const validatorCount = await voteraVote.getValidatorCount(proposal);

        await expect(
            contract.finishVote(proposal, validatorCount, [
                expectVoteCounts[0],
                expectVoteCounts[1],
                expectVoteCounts[2],
            ])
        ).to.be.revertedWith("NotAuthorized");
        await expect(
            validatorBudget.finishVote(proposal, validatorCount, [
                expectVoteCounts[0],
                expectVoteCounts[1],
                expectVoteCounts[2],
            ])
        ).to.be.revertedWith("NotAuthorized");
    });
});
