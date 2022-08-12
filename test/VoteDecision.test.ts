import chai, { expect } from "chai";
import crypto from "crypto";
import { solidity } from "ethereum-waffle";
import { BigNumber, BigNumberish, BytesLike, utils, Wallet } from "ethers";
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
const InvalidProposal = "0x43d26d775ef3a282483394ce041a2757fbf700c9cf86accc6f0ce410accf123f";
const DocHash = "0x9f18669085971c1306dd0096ec531e71ad2732fd0e783068f2a3aba628613231";

chai.use(solidity);

function toSystemInput(title: string, start: number, end: number, docHash: BytesLike) {
    return { start, end, startAssess: 0, endAssess: 0, docHash, amount: 0, title };
}

function toFundInput(
    title: string,
    start: number,
    end: number,
    startAssess: number,
    endAssess: number,
    docHash: BytesLike,
    amount: BigNumberish
) {
    return { start, end, startAssess, endAssess, docHash, amount, title };
}

function getNewProposal() {
    for (;;) {
        const proposal = `0x${crypto.randomBytes(32).toString("hex")}`;
        if (proposal !== InvalidProposal) {
            return proposal;
        }
    }
}

async function displayBalance(address: string, message: string) {
    const balance = await ethers.provider.getBalance(address);
    console.log(`${message}_balance = ${balance.toString()}`);
}

describe("Test of Vote Decision", () => {
    let commonsBudget: CommonsBudget;
    let voteraVote: VoteraVote;

    const { provider } = waffle;
    const [admin, voteManager, ...richValidators] = provider.getWallets();
    const adminSigner = provider.getSigner(admin.address);
    const basicFee = ethers.utils.parseEther("100.0");
    const fundAmount = ethers.utils.parseEther("10000.0");

    let proposalID: string;

    const assessCount = 2;
    const passAssessResult = [7, 7, 7, 7, 7];

    // create more validators and have 100 validators in total
    let validators: Wallet[] = [];
    validators = validators.concat(richValidators);
    for (let i = validators.length; i < 100; i += 1) {
        validators = validators.concat(provider.createEmptyWallet());
    }

    before(async () => {
        // deploy CommonsBudget
        const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
        commonsBudget = await commonsBudgetFactory.connect(admin).deploy();
        await commonsBudget.deployed();

        // deploy VoteraVote
        const voteraVoteFactory = await ethers.getContractFactory("VoteraVote");
        voteraVote = await voteraVoteFactory.connect(voteManager).deploy();
        await voteraVote.deployed();

        await voteraVote.changeCommonBudgetContract(commonsBudget.address);
        const changeParamTx = await commonsBudget.changeVoteParam(voteManager.address, voteraVote.address);
        await changeParamTx.wait();

        // send 1 million BOA to CommonsBudget contract
        const commonsFund = BigNumber.from(10).pow(18).mul(500000);
        for (let i = 0; i < 2; i++) {
            await provider.getSigner(richValidators[i].address).sendTransaction({
                to: commonsBudget.address,
                value: commonsFund,
            });
        }
    });

    beforeEach(() => {
        // generate random proposal id (which is address type)
        proposalID = getNewProposal();
    });

    const createSystemProposal = async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "SystemProposalTitle";
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const signProposal = await signSystemProposal(voteManager, proposalID, title, startTime, endTime, docHash);

        const proposerBudget = CommonsBudgetFactory.connect(commonsBudget.address, validators[0]);
        const makeProposalTx = await proposerBudget.createSystemProposal(
            proposalID,
            toSystemInput(title, startTime, endTime, docHash),
            signProposal,
            { value: basicFee }
        );
        await makeProposalTx.wait();
    };

    const createFundProposal = async () => {
        const blockLatest = await ethers.provider.getBlock("latest");
        const title = "FundProposalTitle";
        const startAssess = blockLatest.timestamp;
        const endAssess = startAssess + 15000;
        const startTime = blockLatest.timestamp + 30000;
        const endTime = startTime + 30000;
        const docHash = DocHash;
        const proposer = validators[0].address;
        const signProposal = await signFundProposal(
            voteManager,
            proposalID,
            title,
            startTime,
            endTime,
            startAssess,
            endAssess,
            docHash,
            fundAmount,
            proposer
        );

        const proposerBudget = CommonsBudgetFactory.connect(commonsBudget.address, validators[0]);
        const makeProposalTx = await proposerBudget.createFundProposal(
            proposalID,
            toFundInput(title, startTime, endTime, startAssess, endAssess, docHash, fundAmount),
            signProposal,
            { value: basicFee }
        );
        await makeProposalTx.wait();
    };

    const processVote = async (positive: number, negative: number, blank: number) => {
        const proposalData = await commonsBudget.getProposalData(proposalID);
        const startTime = proposalData.start;
        const endTime = proposalData.end;
        const openTime = endTime.add(30);
        const voterCount = positive + negative + blank;
        await voteraVote.setupVoteInfo(proposalID, startTime, endTime, openTime, "info");
        await voteraVote.addValidators(
            proposalID,
            validators.map((v) => v.address),
            true
        );

        // distribute vote fess to validators
        const maxCountDist = (await commonsBudget.connect(adminSigner).vote_fee_distrib_count()).toNumber();
        const distCallCount = validators.length / maxCountDist;
        for (let i = 0; i < distCallCount; i += 1) {
            const start = i * maxCountDist;
            await commonsBudget.distributeVoteFees(proposalID, start);
            await network.provider.send("evm_mine");
        }

        // Fund proposal
        if (proposalData.proposalType === 1) {
            for (let i = 0; i < assessCount; i += 1) {
                const assessVote = VoteraVoteFactory.connect(voteraVote.address, validators[i]);
                await assessVote.submitAssess(proposalID, passAssessResult);
            }
            // wait unit assessEnd
            await network.provider.send("evm_increaseTime", [15000]);
            await network.provider.send("evm_mine");

            await voteraVote.countAssess(proposalID);

            // wait until startTime
            await network.provider.send("evm_increaseTime", [15000]);
            await network.provider.send("evm_mine");
        } else {
            // wait until startTime
            await network.provider.send("evm_increaseTime", [30000]);
            await network.provider.send("evm_mine");
        }

        // setup votes
        const choices: number[] = [];
        const nonces: number[] = [];

        // set positive votes
        for (let i = 0; i < positive; i += 1) {
            choices.push(1);
            nonces.push(i + 1);
        }

        // set negative votes
        for (let i = positive; i < positive + negative; i += 1) {
            choices.push(2);
            nonces.push(i + 1);
        }

        // set blank (= abstention) votes
        for (let i = positive + negative; i < voterCount; i += 1) {
            choices.push(0);
            nonces.push(i + 1);
        }

        let submitBallotTx;
        for (let i = 0; i < voterCount; i += 1) {
            const commitment = await makeCommitment(
                voteraVote.address,
                proposalID,
                validators[i].address,
                choices[i],
                nonces[i]
            );
            const signature = await signCommitment(voteManager, proposalID, validators[i].address, commitment);
            const ballotVote = VoteraVoteFactory.connect(voteraVote.address, validators[i]);
            submitBallotTx = await ballotVote.submitBallot(proposalID, commitment, signature);
        }

        expect(await voteraVote.getBallotCount(proposalID)).equal(voterCount);

        if (submitBallotTx) {
            await submitBallotTx.wait();
        }

        await network.provider.send("evm_increaseTime", [30000]);
        await network.provider.send("evm_mine");

        for (let i = 0; i < voterCount; i += 1) {
            const ballotAddr = await voteraVote.getBallotAt(proposalID, i);
            const ballot = await voteraVote.getBallot(proposalID, ballotAddr);
            expect(ballot.key).equal(validators[i].address);
        }

        // wait until openTime
        await network.provider.send("evm_increaseTime", [30]);
        await network.provider.send("evm_mine");

        await voteraVote.revealBallot(
            proposalID,
            validators.slice(0, voterCount).map((v) => v.address),
            choices,
            nonces
        );
        await voteraVote.countVote(proposalID);
    };

    it("finishVote: Proposal is approved", async () => {
        await createFundProposal();

        const blockLatest = await ethers.provider.getBlock("latest");
        await processVote(50, 0, 0);

        const proposalData = await commonsBudget.getProposalData(proposalID);
        expect(proposalData.state).equal(4); // FINISHED
        expect(proposalData.proposalResult).equal(1); // APPROVED
        expect(Number(proposalData.countingFinishTime)).greaterThan(blockLatest.timestamp);
    });
});
