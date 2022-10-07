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

    const validator_count: number = Number(process.env.VALIDATOR_COUNT || "0");
    const validators = vals.slice(0, validator_count);

    const storageAddress = await commonsBudget.getStorageContractAddress();
    const storageFactory = await ethers.getContractFactory("CommonsStorage");
    const storageContract = await storageFactory.attach(storageAddress);

    const managerVoteraVote = voteraVote.connect(voteManagerSigner);
    await managerVoteraVote.addValidators(
        proposalID,
        validators.map((v) => v.address),
        true
    );
    console.log("addValidators finished!");

    // distribute vote fess to validators
    const managerCommons = commonsBudget.connect(managerSigner);
    const maxCountDist = (await storageContract.voteFeeDistribCount()).toNumber();
    const distCallCount = validators.length / maxCountDist;
    for (let i = 0; i < distCallCount; i += 1) {
        const start = i * maxCountDist;
        console.log("calling distributeVoteFees from the start index of", start);
        await managerCommons.distributeVoteFees(proposalID, start);
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
