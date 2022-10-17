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
import common from "mocha/lib/interfaces/common";
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

    const storageAddress = await commonsBudget.getStorageContractAddress();
    const storageFactory = await ethers.getContractFactory("CommonsStorage");
    const storageContract = await storageFactory.attach(storageAddress);

    const fundProposalFeePermil = Number(process.env.FUND_PROPOSAL_FEE_PERMIL || "0");
    const systemProposalFee = BigNumber.from(process.env.SYSTEM_PROPOSAL_FEE || "0");
    const voteQuorumFactor = Number(process.env.VOTE_QUORUM_FACTOR || "0");
    const voterFee = BigNumber.from(process.env.VOTER_FEE || "0");
    const withdrawDelayPeriod = Number(process.env.WITHDRAW_DELAY_PERIOD || "0");

    console.log("fundProposalFeePermil:", fundProposalFeePermil);
    console.log("systemProposalFee:", systemProposalFee.toString());
    console.log("voteQuorumFactor:", voteQuorumFactor);
    console.log("voterFee:", voterFee.toString());
    console.log("withdrawDelayPeriod:", withdrawDelayPeriod);

    await storageContract.setFundProposalFeePermil(fundProposalFeePermil);
    await storageContract.setSystemProposalFee(systemProposalFee);
    await storageContract.setVoteQuorumFactor(voteQuorumFactor);
    await storageContract.setVoterFee(voterFee);
    await storageContract.setWithdrawDelayPeriod(withdrawDelayPeriod);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
