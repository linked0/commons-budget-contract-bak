// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { expect } from "chai";
import crypto from "crypto";
import { BigNumber, Wallet } from "ethers";
import * as fs from "fs";
import { ethers } from "hardhat";
import { join } from "path";
import { start } from "repl";
import { assessProposal } from "../test/VoteHelper";
import { CommonsBudget__factory as CommonsBudgetFactory } from "../typechain-types";
import { GasPriceManager } from "../utils/GasPriceManager";

import { NonceManager } from "@ethersproject/experimental";

const AddressZero = "0x0000000000000000000000000000000000000000";
const InvalidProposal = "0x43d26d775ef3a282483394ce041a2757fbf700c9cf86accc6f0ce410accf123f";
const DocHash = "0x9f18669085971c1306dd0096ec531e71ad2732fd0e783068f2a3aba628613231";

interface IValidatorInfo {
    index: number;
    privateKey: string;
    address: string;
}

function getNewProposal() {
    for (;;) {
        const proposal = `0x${crypto.randomBytes(32).toString("hex")}`;
        if (proposal !== InvalidProposal) {
            return proposal;
        }
    }
}

async function main() {
    const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
    const voteraVoteFactory = await ethers.getContractFactory("VoteraVote");
    const provider = ethers.provider;
    const [admin, voteManager, user, manager, proposer, ...validators] = await ethers.getSigners();
    const adminSigner = new NonceManager(new GasPriceManager(provider.getSigner(admin.address)));
    const voteManagerSigner = new NonceManager(new GasPriceManager(provider.getSigner(voteManager.address)));

    const commonsBudget = await commonsBudgetFactory.attach(process.env.COMMONS_BUDGET_CONTRACT || "");
    const voteraVote = await voteraVoteFactory.attach(process.env.VOTERA_VOTE_CONTRACT || "");

    const blockLatest = await ethers.provider.getBlock("latest");
    console.log("Current Height: ", blockLatest.number);

    // current proposal information from CommonsBudget
    const proposalID = process.env.FUND_PROPOSAL_ID || "";
    const proposalData = await commonsBudget.getProposalData(proposalID);
    const mamager = await commonsBudget.manager();
    console.log("========== Proposal Information ==========");
    console.log("ID: ", proposalID);
    let date = new Date(Number(proposalData.startAssess) * 1000);
    console.log("Assess Start: ", date.toLocaleString());
    date = new Date(Number(proposalData.endAssess) * 1000);
    console.log("Assess   End: ", date.toLocaleString());
    date = new Date(Number(proposalData.start) * 1000);
    console.log("Vote   Start: ", date.toLocaleString());
    date = new Date(Number(proposalData.end) * 1000);
    console.log("Vote     End: ", date.toLocaleString());
    date = new Date(Number(proposalData.countingFinishTime) * 1000);
    console.log("Count Finish: ", date.toLocaleString());

    const valCount = await voteraVote.getValidatorCount(proposalID);
    console.log("Validator count: ", valCount);
    switch (proposalData.state) {
        case 0:
            console.log("Proposal state: INVALID");
            break;
        case 1:
            console.log("Proposal state: CREATED");
            break;
        case 2:
            console.log("Proposal state: REJECTED");
            break;
        case 3:
            console.log("Proposal state: ACCEPTED");
            break;
        case 4:
            console.log("Proposal state: FINISHED");
            break;
        default:
            console.log("Proposal state: ABNORMAL STATE");
    }
    switch (proposalData.proposalResult) {
        case 0:
            console.log("Proposal result: NONE");
            break;
        case 1:
            console.log("Proposal result: APPROVED");
            break;
        case 2:
            console.log("Proposal result: REJECTED");
            break;
        case 3:
            console.log("Proposal result: INVALID_QUORUM");
            break;
        case 4:
            console.log("Proposal result: ASSESSMENT_FAILED");
            break;
        default:
            console.log("Proposal result: ABNORMAL STATE");
    }

    // votera vote information
    const voteInfo = await voteraVote.voteInfos(proposalID);
    console.log("========== Vote information ==========");
    switch (voteInfo.state) {
        case 0:
            console.log("state: INVALID");
            break;
        case 1:
            console.log("state: CREATED");
            break;
        case 2:
            console.log("state: SETTING");
            break;
        case 3:
            console.log("state: ASSESSING");
            break;
        case 4:
            console.log("state: RUNNING");
            break;
        case 5:
            console.log("state: FINISHED");
            break;
        default:
            console.log("state: ABNORMAL STATE");
    }
    console.log("openVote: ", new Date(Number(voteInfo.openVote) * 1000).toLocaleString());
    console.log("Assess count: ", await voteraVote.getAssessCount(proposalID));

    // validators on votera
    // const valCount = await voteraVote.getValidatorCount(proposalID);
    // for (let i = 0; i < valCount; i++) {
    //     const address =  await voteraVote.getValidatorAt(proposalID, i);
    //     console.log("Validator", i, ":", address);
    // }

    // voting information
    console.log("========== Voting information ==========");
    const voteCount = await voteraVote.getBallotCount(proposalID);
    console.log("Vote count:", voteCount);

    // check validation of votes
    // for (let i = 0; i < voteCount; i += 1) {
    //     const ballotAddr = await voteraVote.getBallotAt(proposalID, i);
    //     const ballot = await voteraVote.getBallot(proposalID, ballotAddr);
    //     expect(ballot.key).equal(validators[i].address);
    // }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
