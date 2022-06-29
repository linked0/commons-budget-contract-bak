import chai, { expect } from "chai";
import { solidity } from "ethereum-waffle";
import { BigNumber, utils } from "ethers";
import { ethers, network, waffle } from "hardhat";
import crypto from "crypto";
import {
    CommonsBudget,
    CommonsBudget__factory as CommonsBudgetFactory,
    VoteraVote,
    VoteraVote__factory as VoteraVoteFactory,
} from "../typechain";
import { signCommitment, makeCommitment } from "./VoteHelper";

import * as assert from "assert";

const AddressZero = "0x0000000000000000000000000000000000000000";
const AddressNormal = "0xcD958D25697A04B0e55BF13c5ADE051beE046354";
const DocHash = "0x9f18669085971c1306dd0096ec531e71ad2732fd0e783068f2a3aba628613231";

function getHash(body: string): string {
    const hash = crypto.createHash("sha256");
    hash.update(Buffer.from(body, "utf8"));
    return ethers.utils.hexZeroPad(`0x${hash.digest("hex")}`, 32);
}
  
chai.use(solidity);

describe("Test of Commons Budget Contract", () => {
    let contract: CommonsBudget;
    let voteraVote: VoteraVote;

    const basicFee = ethers.utils.parseEther("0.0001");

    const provider = waffle.provider;
    const [admin, voteChair, ...validators] = provider.getWallets();
    const amount = BigNumber.from(10).pow(18);
    const admin_signer = provider.getSigner(admin.address);

    let proposal: string;

    before(async () => {
        const CommonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
        contract = (await CommonsBudgetFactory.deploy()) as CommonsBudget;
        await contract.deployed();

        const voteraVoteFactory = await ethers.getContractFactory("VoteraVote");
        voteraVote = await voteraVoteFactory.connect(voteChair).deploy();
        await voteraVote.deployed();
        await voteraVote.changeBudget(contract.address);

        const voteAddress = voteraVote.address;
        const changeParamTx = await contract.changeVoteParam(voteChair.address, voteAddress);
        await changeParamTx.wait();
    });

    beforeEach(() => {
        proposal = `0x${crypto.randomBytes(32).toString("hex")}`;
    });

    it("Send", async () => {
        await provider.getSigner(admin.address).sendTransaction({
            to: contract.address,
            value: amount,
        });
    });

    it("Check", async () => {
        const balance = await provider.getBalance(contract.address);
        assert.deepStrictEqual(balance, amount);
    });

    it("Check Proposal Fee", async () => {
        const fundProposalFee = await contract.getFundProposalFeePermil();
        assert.deepStrictEqual(fundProposalFee.toString(), "10");
        const systemProposalFe = await contract.getSystemProposalFee();
        assert.deepStrictEqual(systemProposalFe.toString(), "100000000000000000000");
    });

    it("Set Proposal Fee", async () => {
        await contract.connect(admin_signer).setFundProposalFeePermil(20);
        await contract.connect(admin_signer).setSystemProposalFee(BigNumber.from(500).mul(BigNumber.from(10).pow(18)));

        const fundProposalFee = await contract.getFundProposalFeePermil();
        assert.deepStrictEqual(fundProposalFee.toString(), "20");
        const systemProposalFe = await contract.getSystemProposalFee();
        assert.deepStrictEqual(systemProposalFe.toString(), "500000000000000000000");
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

    it("changeVoteParam", async () => {
        const CommonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
        const testContract = (await CommonsBudgetFactory.deploy()) as CommonsBudget;
        await testContract.deployed();

        await testContract.changeVoteParam(admin.address, contract.address);
        expect(await testContract.voteChair()).equal(admin.address);
        expect(await testContract.voteAddress()).equal(contract.address);
    });

    it("changeVoteParam: Ownable: caller is not the owner", async () => {
        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        await expect(voteBudget.changeVoteParam(validators[0].address, AddressNormal)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("changeVoteParam: InvalidInput", async () => {
        await expect(contract.changeVoteParam(AddressZero, AddressNormal)).to.be.revertedWith("InvalidInput");
        await expect(contract.changeVoteParam(AddressNormal, AddressZero)).to.be.revertedWith("InvalidInput");
    });

    it("makeSystemProposalData", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeSystemProposalData(
            proposal,
            "SystemProposalTitle",
            startTime,
            endTime,
            docHash,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const proposalData = await contract.getProposalData(proposal);
        expect(proposalData.proposalType).equal(0); // SYSTEM type
        expect(proposalData.title).equal("SystemProposalTitle");
        expect(proposalData.start).equal(startTime);
        expect(proposalData.end).equal(endTime);
        expect(proposalData.docHash).equal(docHash);
        expect(proposalData.fundAmount).equal(BigNumber.from(0));
        expect(proposalData.proposer).equal(AddressZero);
        expect(proposalData.rejected).equal(false);
        expect(proposalData.cause).equal(0); // NONE cause
        expect(proposalData.validatorSize).equal(BigNumber.from(0));

        expect(await contract.getProposalValues(proposal)).equal(basicFee);

        // make sure proposal is initialized in voteraVote
        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        const voteAddress = (await voteBudget.getProposalData(proposal)).voteAddress;
        expect(voteAddress).equal(voteraVote.address);

        const voteInfo = await voteraVote.voteInfos(proposal);
        expect(voteInfo.budget).equal(contract.address);
    });

    it("makeSystemProposalData: InvalidFee", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;

        // call without fee
        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        await expect(validatorBudget.makeSystemProposalData(
            proposal,
            "SystemProposalTitle",
            startTime,
            endTime,
            docHash
        )).to.be.revertedWith("InvalidFee");
    });

    it("makeSystemProposalData: InvalidInput", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const wrongStartTime = 0;
        await expect(validatorBudget.makeSystemProposalData(
            proposal,
            "SystemProposalTitle",
            wrongStartTime,
            endTime,
            docHash,
            { value: basicFee }
        )).to.be.revertedWith("InvalidInput");
        const wrongEndTime = startTime - 100;
        await expect(validatorBudget.makeSystemProposalData(
            proposal,
            "SystemProposalTitle",
            startTime,
            wrongEndTime,
            docHash,
            { value: basicFee }
        )).to.be.revertedWith("InvalidInput");
    });

    it("makeSystemProposalData: DuplicatedProposal", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        await validatorBudget.makeSystemProposalData(
            proposal,
            "SystemProposalTitle",
            startTime,
            endTime,
            docHash,
            { value: basicFee }
        );

        // call again with same proposal
        await expect(validatorBudget.makeSystemProposalData(
            proposal,
            "SystemProposalTitle",
            startTime,
            endTime,
            docHash,
            { value: basicFee }
        )).to.be.revertedWith("DuplicatedProposal");
    });

    it("makeSystemProposalData: NotReady", async () => {
        const newFactory = await ethers.getContractFactory("CommonsBudget");
        const newContract = (await newFactory.deploy()) as CommonsBudget;
        await newContract.deployed();

        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;

        // call makeSystemProposalData without initializing changeVoteParam of contract

        const validatorBudget = CommonsBudgetFactory.connect(newContract.address, validators[0]);
        await expect(validatorBudget.makeSystemProposalData(
            proposal,
            "SystemProposalTitle",
            startTime,
            endTime,
            docHash,
            { value: basicFee }
        )).to.be.revertedWith("NotReady");
    });

    it("makeFundProposalData", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const proposalData = await contract.getProposalData(proposal);
        expect(proposalData.proposalType).equal(1); // FUND type
        expect(proposalData.title).equal("FundProposalTitle");
        expect(proposalData.start).equal(startTime);
        expect(proposalData.end).equal(endTime);
        expect(proposalData.docHash).equal(docHash);
        expect(proposalData.fundAmount).equal(fundAmount);
        expect(proposalData.proposer).equal(proposer);
        expect(proposalData.rejected).equal(false);
        expect(proposalData.cause).equal(0); // NONE cause
        expect(proposalData.validatorSize).equal(BigNumber.from(0));

        expect(await contract.getProposalValues(proposal)).equal(basicFee);

        // make sure proposal is initialized in voteraVote
        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        const voteAddress = (await voteBudget.getProposalData(proposal)).voteAddress;
        expect(voteAddress).equal(voteraVote.address);

        const voteInfo = await voteraVote.voteInfos(proposal);
        expect(voteInfo.budget).equal(contract.address);
    });

    it("makeFundProposalData: InvalidFee", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        // call without fee
        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        await expect(validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer
        )).to.be.revertedWith("InvalidFee");
    });

    it("makeFundProposalData: InvalidInput", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const wrongStartTime = 0;
        await expect(validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            wrongStartTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        )).to.be.revertedWith("InvalidInput");
        const wrongEndTime = startTime - 100;
        await expect(validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            wrongEndTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        )).to.be.revertedWith("InvalidInput");
    });

    it("makeFundProposalData: DuplicatedProposal", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );

        // call again with same proposal
        await expect(validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        )).to.be.revertedWith("DuplicatedProposal");
    });

    it("makeFundProposalData: NotReady", async () => {
        const newFactory = await ethers.getContractFactory("CommonsBudget");
        const newContract = (await newFactory.deploy()) as CommonsBudget;
        await newContract.deployed();

        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        // call makeFundProposalData without initializing changeVoteParam of contract

        const validatorBudget = CommonsBudgetFactory.connect(newContract.address, validators[0]);
        await expect(validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        )).to.be.revertedWith("NotReady");
    });

    it("payProposalFee", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const payAmount = ethers.utils.parseEther("0.01");
        const payProposalTx = await validatorBudget.payProposalFee(proposal, { value: payAmount });
        await payProposalTx.wait();

        expect(await validatorBudget.getProposalValues(proposal)).equal(payAmount.add(basicFee));

        const otherBudget = CommonsBudgetFactory.connect(contract.address, validators[1]);
        await otherBudget.payProposalFee(proposal, { value: payAmount });
        expect(await validatorBudget.getProposalValues(proposal)).equal(payAmount.add(payAmount).add(basicFee));
    });

    it("payProposalFee: InvalidFee", async () => {
        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        await expect(validatorBudget.payProposalFee(proposal)).to.be.revertedWith("InvalidFee");
    });

    it("payProposalFee: NotFoundProposal", async () => {
        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        await expect(validatorBudget.payProposalFee(proposal, { value: basicFee })).to.be.revertedWith("NotFoundProposal");
    });

    it("rejectAssess", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        await voteBudget.rejectAssess(proposal);

        const proposalData = await voteBudget.getProposalData(proposal);
        expect(proposalData.rejected).equal(true);
        expect(proposalData.cause).equal(1); // SCORE
    });

    it("rejectAssess: NotFoundProposal", async () => {
        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        await expect(voteBudget.rejectAssess(proposal)).to.be.revertedWith("NotFoundProposal");
    });

    it("rejectAssess: NotFundProposal", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeSystemProposalData(
            proposal,
            "SystemProposalTitle",
            startTime,
            endTime,
            docHash,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        await expect(voteBudget.rejectAssess(proposal)).to.be.revertedWith("NotFundProposal");
    });

    it("rejectAssess: Delayed", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        // wait until startTime
        await network.provider.send("evm_increaseTime", [30000]);
        await network.provider.send("evm_mine");
        
        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        await expect(voteBudget.rejectAssess(proposal)).to.be.revertedWith("Delayed");
    });

    it("rejectAssess: RejectedProposal", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        await voteBudget.rejectAssess(proposal);
        
        await expect(voteBudget.rejectAssess(proposal)).to.be.revertedWith("RejectedProposal");
    });

    it("rejectAssess: NotAuthorized", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        await expect(contract.rejectAssess(proposal)).to.be.revertedWith("NotAuthorized");
    });

    it("voteStarted", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const fee = fundAmount.div(10);

        await validatorBudget.payProposalFee(proposal, { value: fee });

        // wait until startTime
        await network.provider.send("evm_increaseTime", [30000]);
        await network.provider.send("evm_mine");

        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        await voteBudget.voteStarted(proposal);

        const proposalData = await voteBudget.getProposalData(proposal);
        expect(proposalData.cause).equal(0); // NONE
    });

    it("voteStarted: cause = RejectedCause.FEE", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const fee = fundAmount.div(100);

        await validatorBudget.payProposalFee(proposal, { value: fee });

        // wait until startTime
        await network.provider.send("evm_increaseTime", [30000]);
        await network.provider.send("evm_mine");

        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        await voteBudget.voteStarted(proposal);

        const proposalData = await voteBudget.getProposalData(proposal);
        expect(proposalData.cause).equal(2); // FEE
    });

    it("voteStarted: NotFoundProposal", async () => {
        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        await expect(voteBudget.voteStarted(proposal)).to.be.revertedWith("NotFoundProposal");
    });

    it("voteStarted: TooEarly", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        await expect(voteBudget.voteStarted(proposal)).to.be.revertedWith("TooEarly");
    });

    it("voteStarted: RejectedProposal", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );
        await makeProposalTx.wait();
        
        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        await voteBudget.rejectAssess(proposal);
        
        // wait until startTime
        await network.provider.send("evm_increaseTime", [30000]);
        await network.provider.send("evm_mine");

        await expect(voteBudget.voteStarted(proposal)).to.be.revertedWith("RejectedProposal");
    });

    it("voteStarted: NotAuthorized", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        // wait until startTime
        await network.provider.send("evm_increaseTime", [30000]);
        await network.provider.send("evm_mine");

        await expect(contract.voteStarted(proposal)).to.be.revertedWith("NotAuthorized");
    });

    const recordVote = async (voteAddress: string, registerResult: boolean): Promise<number[]> => {
        const proposalData = await contract.getProposalData(proposal);
        const startTime = proposalData.start;
        const endTime = proposalData.end;
        const openTime = endTime.add(30);

        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(proposal, validators.map((v) => v.address));

        // wait until startTime
        await network.provider.send("evm_increaseTime", [30000]);
        await network.provider.send("evm_mine");

        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        await voteBudget.voteStarted(proposal);

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
            const signature = await signCommitment(
                voteChair,
                proposal,
                validators[i].address,
                commitment
            );

            const ballotVote = VoteraVoteFactory.connect(voteAddress, validators[i]);
            submitBallotTx = await ballotVote.submitBallot(proposal, commitment, signature);
        }

        expect(await voteraVote.ballotCount(proposal)).equal(voterCount);

        if (submitBallotTx) {
            await submitBallotTx.wait();
        }

        if (!registerResult) {
            return expectVoteCounts;
        }

        await network.provider.send("evm_increaseTime", [30000]);
        await network.provider.send("evm_mine");

        for (let i = 0; i < voterCount; i += 1) {
            const ballot = await voteraVote.getBallotAtIndex(proposal, i);
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
        await voteraVote.registerResult(proposal);

        return expectVoteCounts;
    };

    it("votePublished", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const fee = fundAmount.div(10);

        await validatorBudget.payProposalFee(proposal, { value: fee });

        const voteAddress = (await contract.getProposalData(proposal)).voteAddress;
        const expectVoteCounts = await recordVote(voteAddress, true);

        const validatorCount = await voteraVote.getValidatorCount(proposal);
        const voteCounts = await voteraVote.getVoteCounts(proposal);

        for (let i = 0; i < 3; i += 1) {
            expect(voteCounts[i]).equal(BigNumber.from(expectVoteCounts[i]));
        }

        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        const votePublishedTx = await voteBudget.votePublished(proposal, validatorCount, voteCounts);
        await votePublishedTx.wait();

        const proposalData = await contract.getProposalData(proposal);
        expect(proposalData.validatorSize).equal(validatorCount);
        for (let i = 0; i < 3; i += 1) {
            expect(proposalData.voteCounts[i]).equal(voteCounts[i]);
        }
    });

    it("votePublished: NotFoundProposal", async () => {
        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        const validatorCount = 9;
        const voteCounts = [3, 3, 3];
        await expect(voteBudget.votePublished(proposal, validatorCount, voteCounts)).to.be.revertedWith("NotFoundProposal");
    });

    it("votePublished: NotEnd", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const fee = fundAmount.div(10);

        await validatorBudget.payProposalFee(proposal, { value: fee });

        const voteAddress = (await contract.getProposalData(proposal)).voteAddress;
        const expectVoteCounts = await recordVote(voteAddress, false); //
        
        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        const validatorCount = 9;
        const voteCounts = [3, 3, 3];
        await expect(voteBudget.votePublished(proposal, validatorCount, voteCounts)).to.be.revertedWith("NotEnd");
    });

    it("votePublished: RejectedProposal(Score)", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const voteBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        await voteBudget.rejectAssess(proposal);

        await network.provider.send("evm_increaseTime", [60000]);
        await network.provider.send("evm_mine");

        const validatorCount = 9;
        const voteCounts = [3, 3, 3];
        await expect(voteBudget.votePublished(proposal, validatorCount, voteCounts)).to.be.revertedWith("RejectedProposal");
    });

    it("votePublished: NotAuthorized", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const fee = fundAmount.div(10);

        await validatorBudget.payProposalFee(proposal, { value: fee });

        const voteAddress = (await contract.getProposalData(proposal)).voteAddress;
        const expectVoteCounts = await recordVote(voteAddress, true);

        const validatorCount = await voteraVote.getValidatorCount(proposal);
        const voteCounts = await voteraVote.getVoteCounts(proposal);
        for (let i = 0; i < 3; i += 1) {
            expect(voteCounts[i]).equal(BigNumber.from(expectVoteCounts[i]));
        }

        await expect(contract.votePublished(proposal, validatorCount, voteCounts)).to.be.revertedWith("NotAuthorized");
        await expect(validatorBudget.votePublished(proposal, validatorCount, voteCounts)).to.be.revertedWith("NotAuthorized");
    });

    it("votePublished: InvalidInput", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const fundAmount = ethers.utils.parseEther("1.0");
        const proposer = validators[0].address;

        const validatorBudget = CommonsBudgetFactory.connect(contract.address, validators[0]);
        const makeProposalTx = await validatorBudget.makeFundProposalData(
            proposal,
            "FundProposalTitle",
            startTime,
            endTime,
            docHash,
            fundAmount,
            proposer,
            { value: basicFee }
        );
        await makeProposalTx.wait();

        const fee = fundAmount.div(10);

        await validatorBudget.payProposalFee(proposal, { value: fee });

        const voteAddress = (await contract.getProposalData(proposal)).voteAddress;
        const expectVoteCounts = await recordVote(voteAddress, true);

        const validatorCount = await voteraVote.getValidatorCount(proposal);
        const voteCounts = await voteraVote.getVoteCounts(proposal);
        for (let i = 0; i < 3; i += 1) {
            expect(voteCounts[i]).equal(BigNumber.from(expectVoteCounts[i]));
        }

        const voteraBudget = CommonsBudgetFactory.connect(contract.address, voteChair);
        await expect(voteraBudget.votePublished(proposal, validatorCount.add(1), voteCounts)).to.be.revertedWith("InvalidInput");

        const invalidVoteCountsLength = [3, 3, 3, 0];
        await expect(voteraBudget.votePublished(proposal, validatorCount, invalidVoteCountsLength)).to.be.revertedWith("InvalidInput");

        const invalidVoteCountsValue = voteCounts.map((v, index) => index === 0 ? v.sub(1) : v);
        await expect(voteraBudget.votePublished(proposal, validatorCount, invalidVoteCountsValue)).to.be.revertedWith("InvalidInput");

        const votePublishedTx = await voteraBudget.votePublished(proposal, validatorCount, voteCounts);
        await votePublishedTx.wait();
    });
});
