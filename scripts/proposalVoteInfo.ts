// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

import crypto from "crypto";
import { BigNumber, Wallet } from "ethers";
import * as fs from "fs";
import { ethers, network } from "hardhat";
import { join } from "path";
import { CommonsBudget__factory as CommonsBudgetFactory } from "../typechain-types";
import { GasPriceManager } from "../utils/GasPriceManager";

import { NonceManager } from "@ethersproject/experimental";

import { displayBalance, getSigners, getValidators } from "../utils/CommonUtil";

async function main() {
    // boiler-plate
    const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
    const voteraVoteFactory = await ethers.getContractFactory("VoteraVote");
    const commonsBudget = await commonsBudgetFactory.attach(process.env.COMMONS_BUDGET_CONTRACT || "");
    const voteraVote = await voteraVoteFactory.attach(process.env.VOTERA_VOTE_CONTRACT || "");
    const provider = ethers.provider;
    const [adminSigner, voteManagerSigner, userSigner, managerSigner, proposerSigner] = await getSigners();
    const vals = await getValidators();
    const basicFee = ethers.utils.parseEther("100.0");
    const fundAmount = ethers.utils.parseEther("10000.0");

    // current proposal ID
    const proposalID = process.env.FUND_PROPOSAL_ID || "";
    console.log("Current proposal ID: ", proposalID);

    const proposalData = await commonsBudget.getProposalData(proposalID);
    const startTime = proposalData.start;
    const endTime = proposalData.end;
    const openTime = endTime.add(30);

    const managerVoteraVote = voteraVote.connect(voteManagerSigner);
    await managerVoteraVote.setupVoteInfo(proposalID, startTime, endTime, openTime, "info");
    console.log("setupVoteInfo called for the proposal: ", proposalID);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
