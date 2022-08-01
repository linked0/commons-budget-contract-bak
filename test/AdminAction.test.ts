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

describe("Test actions by contract owner", () => {
    let contract: CommonsBudget;
    let voteraVote: VoteraVote;

    const basicFee = ethers.utils.parseEther("100.0");
    const fundAmount = ethers.utils.parseEther("10000.0");

    const provider = waffle.provider;
    const [admin, voteManager, ...validators] = provider.getWallets();
    const amount = BigNumber.from(10).pow(18);
    const admin_signer = provider.getSigner(admin.address);

    let proposal: string;

    before(async () => {
        const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
        contract = (await commonsBudgetFactory.deploy()) as CommonsBudget;
        await contract.deployed();

        const voteraVoteFactory = await ethers.getContractFactory("VoteraVote");
        voteraVote = await voteraVoteFactory.connect(admin).deploy();
        await voteraVote.deployed();
        await voteraVote.changeCommonBudgetContract(contract.address);

        const voteAddress = voteraVote.address;
        const changeParamTx = await contract.changeVoteParam(voteManager.address, voteAddress);
        await changeParamTx.wait();
    });

    beforeEach(() => {
        proposal = `0x${crypto.randomBytes(32).toString("hex")}`;
    });

    it("Check if admin can distribute vote fees", async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "SystemProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const openTime = endTime + 30;
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

        // ready to start voting
        const voteAddress = (await contract.getProposalData(proposal)).voteAddress;
        await voteraVote.setupVoteInfo(proposal, startTime, endTime, openTime, "info");

        // add only half of validators
        const validators1 = validators.slice(0, validators.length / 2);
        const validators2 = validators.slice(validators1.length, validators.length);
        await voteraVote.addValidators(
            proposal,
            validators1.map((v) => v.address),
            false
        );
        expect(await contract.connect(admin_signer).canDistributeVoteFees(proposal)).equal(false);

        // add all the validators
        await voteraVote.addValidators(
            proposal,
            validators2.map((v) => v.address),
            true
        );
        expect(await contract.connect(admin_signer).canDistributeVoteFees(proposal)).equal(true);
    });
});
