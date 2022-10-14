// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

import chai, { assert, expect } from "chai";
import fs from "fs";
import { join } from "path";
import { GasPriceManager } from "../utils/GasPriceManager";

import { BigNumber, Wallet } from "ethers";
import { ethers } from "hardhat";

import { NonceManager } from "@ethersproject/experimental";

async function main() {
    const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
    const ExecutionFactory = await ethers.getContractFactory("FundExecution");

    const provider = ethers.provider;
    const commonsBudget = await commonsBudgetFactory.attach(process.env.COMMONS_BUDGET_CONTRACT || "");
    const fundExec = await ExecutionFactory.attach(process.env.EXEC_CONTRACT || "");

    const cent = BigNumber.from(10).pow(18);
    const commonsBalance = BigNumber.from(await ethers.provider.getBalance(commonsBudget.address));
    const execBalance = BigNumber.from(await ethers.provider.getBalance(fundExec.address));
    console.log("========== Balance: {BOA} . {CENT} ==========");

    // CommonsBudget balance
    console.log(
        "CommonsBudget (",
        commonsBudget.address,
        ") :",
        commonsBalance.div(cent).toString(),
        ".",
        commonsBalance.mod(cent).toString()
    );

    // DAO balance
    console.log(
        "FundExecution (",
        fundExec.address,
        ") :",
        execBalance.div(cent).toString(),
        ".",
        execBalance.mod(cent).toString()
    );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});