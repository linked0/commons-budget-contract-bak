// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

import chai, { assert, expect } from "chai";
import fs from "fs";
import {join} from "path";
import { GasPriceManager } from "../utils/GasPriceManager";

import { BigNumber, Wallet } from "ethers";
import { ethers } from "hardhat";

import { NonceManager } from "@ethersproject/experimental";

async function main() {
    const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
    const voteraVoteFactory = await ethers.getContractFactory("VoteraVote");

    const provider = ethers.provider;
    const commonsBudget = await commonsBudgetFactory.attach(process.env.COMMONS_BUDGET_CONTRACT || "");
    const [admin, voteManager, user, manager, proposer, ...validators] = await ethers.getSigners();

    const cent = BigNumber.from(10).pow(18);
    const commonsBalance = BigNumber.from(await ethers.provider.getBalance(commonsBudget.address));
    console.log("========== Balance: {BOA} . {CENT} ==========");

    // CommonsBudget balance
    console.log(
        "CommonsBudget (", commonsBudget.address, ") :",
        commonsBalance.div(cent).toString(),
        ".",
        commonsBalance.mod(cent).toString()
    );

    // Admin balance
    const adminBalance = BigNumber.from(await ethers.provider.getBalance(admin.address));
    console.log("Admin         (", admin.address, ") :", adminBalance.div(cent).toString(), ".", adminBalance.mod(cent).toString());

    // Manager balance
    const managerBalance = BigNumber.from(await ethers.provider.getBalance(manager.address));
    console.log(
        "Manager       (", manager.address, ") :",
        managerBalance.div(cent).toString(),
        ".",
        managerBalance.mod(cent).toString()
    );

    // Votera balance
    const voteraBalance = BigNumber.from(await ethers.provider.getBalance(voteManager.address));
    console.log("Votera        (", voteManager.address, ") :", voteraBalance.div(cent).toString(), ".", voteraBalance.mod(cent).toString());

    // Proposal balance
    const proposerBalance = BigNumber.from(await ethers.provider.getBalance(proposer.address));
    console.log(
        "Proposal      (", proposer.address, ") :",
        proposerBalance.div(cent).toString(),
        ".",
        proposerBalance.mod(cent).toString()
    );

    // Part of validators
    // let index:number = 0;
    // const validator_count: number = Number(process.env.VALIDATOR_COUNT || "0");
    // for (const val of validators.slice(0, validator_count)) {
    //     const valBalance = BigNumber.from(await ethers.provider.getBalance(val.address));
    //     console.log(
    //         "Validator", index++,
    //         "(", val.address, "):",
    //         valBalance.div(cent).toString(),
    //         ".",
    //         valBalance.mod(cent).toString()
    //     );
    // }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
