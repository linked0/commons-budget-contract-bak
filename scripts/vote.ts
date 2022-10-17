// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { expect } from "chai";
import crypto from "crypto";
import { BigNumber, BigNumberish, Wallet } from "ethers";
import * as fs from "fs";
import { ethers } from "hardhat";
import { join } from "path";
import { start } from "repl";
import {
    CommonsBudget__factory as CommonsBudgetFactory,
    VoteraVote__factory as VoteraVoteFactory,
} from "../typechain-types";
import { GasPriceManager } from "../utils/GasPriceManager";

import { NonceManager } from "@ethersproject/experimental";

import { getSigners, getValidators, generateVoteData } from "../utils/CommonUtil";

const AddressZero = "0x0000000000000000000000000000000000000000";
const InvalidProposal = "0x43d26d775ef3a282483394ce041a2757fbf700c9cf86accc6f0ce410accf123f";
const DocHash = "0x9f18669085971c1306dd0096ec531e71ad2732fd0e783068f2a3aba628613231";

function makeCommitment(
    vote: string,
    proposalID: string,
    sender: string,
    choice: number,
    nonce: BigNumberish
): Promise<string> {
    const encodedResult = ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "address", "uint8", "uint256"],
        [proposalID, sender, choice, nonce]
    );
    return Promise.resolve(ethers.utils.keccak256(encodedResult));
}

function signCommitment(signer: Wallet, proposalID: string, sender: string, commitment: string): Promise<string> {
    const encodedResult = ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "address", "bytes32"],
        [proposalID, sender, commitment]
    );
    const sig = signer._signingKey().signDigest(ethers.utils.keccak256(encodedResult));
    return Promise.resolve(ethers.utils.joinSignature(sig));
}

async function main() {
    // boiler-plate
    const commonsBudgetFactory = await ethers.getContractFactory("CommonsBudget");
    const voteraVoteFactory = await ethers.getContractFactory("VoteraVote");
    const commonsBudget = await commonsBudgetFactory.attach(process.env.COMMONS_BUDGET_CONTRACT || "");
    const voteraVote = await voteraVoteFactory.attach(process.env.VOTERA_VOTE_CONTRACT || "");
    const provider = ethers.provider;
    const [adminSigner, _, userSigner, managerSigner, proposerSigner] = await getSigners();
    const vals = await getValidators();
    const basicFee = ethers.utils.parseEther("100.0");
    const fundAmount = ethers.utils.parseEther("10000.0");

    // current proposal ID
    const proposalID = process.env.FUND_PROPOSAL_ID || "";
    console.log("Current proposal ID: ", proposalID);

    const validator_count: number = Number(process.env.VALIDATOR_COUNT || "0");
    const validators = vals.slice(0, validator_count);

    const voteManager = new Wallet(process.env.VOTE_KEY || "");
    const voteManagerSigner = new NonceManager(new GasPriceManager(provider.getSigner(voteManager.address)));

    // voting
    const positive = Number(process.env.POSITIVE_VOTE || "0");
    const negative = Number(process.env.NEGATIVE_VOTE || "0");
    const blank = Number(process.env.BLANK_VOTE || "0");
    console.log("Positive voting:", positive);
    console.log("Negative voting:", negative);
    console.log("Blank voting:", blank);

    const [choices, nonces] = generateVoteData(positive, negative, blank);
    const voterCount = positive + negative + blank;

    let submitBallotTx;
    for (let i = 0; i < voterCount; i += 1) {
        const commitment = await makeCommitment(
            voteraVote.address,
            proposalID,
            validators[i].address,
            choices[i],
            nonces[i]
        );
        if (i % 20 === 0 || i === voterCount - 1) {
            console.log("Submitting ballot of validator [", i, "] (address:", validators[i].address, "):", commitment);
        }
        const signature = await signCommitment(voteManager, proposalID, validators[i].address, commitment);
        const valSigner = new NonceManager(new GasPriceManager(provider.getSigner(validators[i].address)));
        const ballotVote = VoteraVoteFactory.connect(voteraVote.address, valSigner);
        submitBallotTx = await ballotVote.submitBallot(proposalID, commitment, signature);

        // TODO: Need to sleep
    }

    if (submitBallotTx) {
        await submitBallotTx.wait();
    }

    console.log("Submitting ballots FINISHED");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
