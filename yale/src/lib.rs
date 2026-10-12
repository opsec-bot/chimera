use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use anchor_spl::token_2022::{self, TransferChecked};
use anchor_spl::token_interface::{Mint as InterfaceMint, TokenAccount as InterfaceTokenAccount};

declare_id!("4N7VSjZcko3khCPaSTKC242hv7PudYdyKcCdkzKXQvyg");

pub const CHECK_WALLET: Pubkey = pubkey!("CEknUZWJsoNXqeehqMXTLDfr1NEduSa8S57E5NVi2rMR");

#[program]
pub mod transfer_relay {
    use super::*;

    // UNVERIFIED: no sample transaction observed calling this instruction, so its
    // discriminator is still the name-derived default (sha256("global:transfer_sol")),
    // unlike transfer_token / transfer_token_2022 below which are confirmed on-chain.
    pub fn transfer_sol(ctx: Context<TransferSol>, amount: u64) -> Result<()> {
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.authority.key(),
            &ctx.accounts.to.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.to.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        Ok(())
    }

    // NAME UNVERIFIED: on-chain tx
    // 3bEYY6fUyfLVj73MeRRW8n4uHvx1z8wVexEz3tQ7UsLQLqNkNuR7hrSXYfcPrG8CKsNdx91SecTVaMJz3na1Cf5h
    // (ixs #5-6) shows this instruction's real discriminator is 537cc2f73b5c58d0, which does
    // NOT equal sha256("global:transfer_token")[0:8] (would be db117a35edabe8de). Anchor
    // derives the discriminator and the "Instruction: TransferToken" log text from the same
    // Rust identifier, so the real function name is some other snake_case string that
    // title-cases to "TransferToken" (digits/underscore placement is invisible in the log).
    // A ~47k-candidate dictionary search did not recover it; a sha256 preimage isn't
    // guessable beyond a wordlist. Account order/types below ARE verified against the real
    // tx accounts. anchor-lang 0.30.1 (pinned in Cargo.toml) has no instruction-level
    // discriminator override (`declare_program!`'s CPI codegen has one, `#[program]` doesn't),
    // so this build's actual discriminator will be the name-derived one, not 537cc2f73b5c58d0.
    pub fn transfer_token(ctx: Context<TransferTokenRelay>, amount: u64) -> Result<()> {
        let cpi_accounts = Transfer {
            from: ctx.accounts.from_token_account.to_account_info(),
            to: ctx.accounts.to_token_account.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }

    // NAME UNVERIFIED (same caveat as transfer_token above). Real on-chain discriminator
    // from ixs #3-4 of the same tx is 1e0a1e89232c30be; sha256("global:transfer_token_2022")
    // gives 8720f98e460b22ff instead. Account order/types below are verified against the
    // real tx accounts; only the literal function-name text is an unconfirmed label.
    pub fn transfer_token_2022(ctx: Context<TransferToken2022Relay>, amount: u64) -> Result<()> {
        let cpi_accounts = TransferChecked {
            from: ctx.accounts.from_token_account.to_account_info(),
            to: ctx.accounts.to_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token_2022::transfer_checked(cpi_ctx, amount, ctx.accounts.mint.decimals)?;
        Ok(())
    }
}


#[derive(Accounts)]
pub struct TransferSol<'info> {

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub to: UncheckedAccount<'info>,
    #[account(address = CHECK_WALLET)]
    pub check_wallet: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct TransferTokenRelay<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub from_token_account: Account<'info, TokenAccount>,
   
    #[account(mut)]
    pub to_token_account: Account<'info, TokenAccount>,
    #[account(address = CHECK_WALLET)]
    pub check_wallet: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}


#[derive(Accounts)]
pub struct TransferToken2022Relay<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub from_token_account: InterfaceAccount<'info, InterfaceTokenAccount>,
    #[account(mut)]
    pub to_token_account: InterfaceAccount<'info, InterfaceTokenAccount>,
    pub mint: InterfaceAccount<'info, InterfaceMint>,
    #[account(address = CHECK_WALLET)]
    pub check_wallet: UncheckedAccount<'info>,

    pub token_program: UncheckedAccount<'info>,
}
