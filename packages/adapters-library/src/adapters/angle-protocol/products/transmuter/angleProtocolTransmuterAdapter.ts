import { z } from 'zod'
import { DeFiAssetsMetadata, WriteOnlyDeFiAdapter } from '../../../../core/adapters/writeOnlyAdapter'
import { CacheToFile } from '../../../../core/decorators/cacheToFile'
import { NotImplementedError } from '../../../../core/errors/errors'
import {
  AssetType,
  PositionType,
  ProtocolDetails,
} from '../../../../types/adapter'
import {
  WriteActionInputSchemas,
  WriteActions,
} from '../../../../types/writeActions'
import { Protocol } from '../../../protocols'
import { GetTransactionParams } from '../../../supportedProtocols'
import { MaxUint256, getAddress } from 'ethers'
import { getTokenMetadata } from '../../../../core/utils/getTokenMetadata'
import { Chain } from '../../../../core/constants/chains'
import { Transmuter__factory } from '../../contracts'

export class AngleProtocolTransmuterAdapter extends WriteOnlyDeFiAdapter {
  productId = 'transmuter'

  getProtocolDetails(): ProtocolDetails {
    return {
      protocolId: this.protocolId,
      name: 'AngleProtocol',
      description: 'AngleProtocol defi adapter',
      siteUrl: 'https://angle.money',
      iconUrl:
        'https://raw.githubusercontent.com/AngleProtocol/angle-assets/main/02%20-%20Logos/02%20-%20Logo%20Only/angle-only-fill-blue.png',
      positionType: PositionType.Supply,
      chainId: this.chainId,
      productId: this.productId,
      assetDetails: {
        type: AssetType.NonStandardErc20,
      },
    }
  }

  @CacheToFile({ fileKey: 'transmuter' })
  async buildMetadata() {
    const contractAddresses: Partial<Record<
      Chain,
      Record<string, string>
    >> = {
      [Chain.Ethereum]: {
        [getAddress(
          '0x1a7e4e63778B4f12a199C062f3eFdD288afCBce8',
        )]: getAddress('0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c'),
        [getAddress(
          '0x0000206329b97DB379d5E1Bf586BbDB969C63274',
        )]: getAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
      },
      [Chain.Base]: {
        [getAddress(
          '0x0000206329b97DB379d5E1Bf586BbDB969C63274',
        )]: getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
      },
      [Chain.Arbitrum]: {
        [getAddress(
          '0x0000206329b97DB379d5E1Bf586BbDB969C63274',
        )]: getAddress('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'),
      },
      [Chain.Polygon]: {
        [getAddress(
          '0x0000206329b97DB379d5E1Bf586BbDB969C63274',
        )]: getAddress('0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'),
      },
    }

    const chainAddresses = contractAddresses[this.chainId];
    if (!chainAddresses) {
      throw new Error('No contract addresses found for chain')
    }

    let result: Record<string, { protocolToken: any; underlyingToken: any[] }> = {}
    for (const contractAddress of Object.keys(chainAddresses)) {
      const underlyingToken = await getTokenMetadata(chainAddresses[contractAddress]!, this.chainId, this.provider)
      const protocolToken = await getTokenMetadata(contractAddress, this.chainId, this.provider)

      result[protocolToken.address] = {
        protocolToken,
        underlyingToken: [underlyingToken],
      }
    }
    return result;
}

  async getTransactionParams({
    action,
    inputs,
  }: Extract<
    GetTransactionParams,
    { protocolId: typeof Protocol.AngleProtocol; productId: 'transmuter' }
  >): Promise<{ to: string; data: string }> {
    const { asset } = inputs;
    const tokens = await this.buildMetadata();
    const underlying = (tokens[asset] as any).underlyingToken[0].address;
    if (!underlying) {
      throw new Error('Underlying token not found')
    }

    const transmuter = getAddress('0x1a7e4e63778B4f12a199C062f3eFdD288afCBce8');
    const transmuterContract = Transmuter__factory.connect(transmuter, this.provider);

    switch (action) {
      case WriteActions.Deposit: {
        const { amount, receiver } = inputs;
        return transmuterContract.swapExactInput.populateTransaction(
          amount,
          1,
          underlying,
          asset,
          receiver,
          0
        )
      }
      case WriteActions.Withdraw: {
        const { amount, receiver } = inputs
        return transmuterContract.swapExactOutput.populateTransaction(
          amount,
          MaxUint256,
          asset,
          underlying,
          receiver,
          0
        )
      }
      default: {
        throw new NotImplementedError()
      }
    }
  }
}

export const WriteActionInputs = {
  [WriteActions.Deposit]: z.object({
    asset: z.string(),
    amount: z.string(),
    receiver: z.string(),
  }),
  [WriteActions.Withdraw]: z.object({
    asset: z.string(),
    amount: z.string(),
    receiver: z.string(),
  }),
} satisfies WriteActionInputSchemas
