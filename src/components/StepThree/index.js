import React, { Component } from 'react'
import arrayMutators from 'final-form-arrays'
import createDecorator from 'final-form-calculate'
import logdown from 'logdown'
import setFieldTouched from 'final-form-set-field-touched'
import { Form } from 'react-final-form'
import { Loader } from '../Common/Loader'
import { NAVIGATION_STEPS, CHAINS } from '../../utils/constants'
import { StepNavigation } from '../Common/StepNavigation'
import { getNetworkVersion, getNetWorkNameById, checkWeb3 } from '../../utils/blockchainHelpers'
import { getStep3Component } from './utils'
import { inject, observer } from 'mobx-react'
import { noGasPriceAvailable, warningOnMainnetAlert } from '../../utils/alerts'
import { sleep, navigateTo } from '../../utils/utils'

const logger = logdown('TW:StepThree')
const { CROWDSALE_SETUP } = NAVIGATION_STEPS

@inject(
  'contractStore',
  'web3Store',
  'tierStore',
  'generalStore',
  'gasPriceStore',
  'reservedTokenStore',
  'deploymentStore',
  'tokenStore',
  'crowdsaleStore'
)
@observer
export class StepThree extends Component {
  state = {
    loading: false,
    reload: false,
    initialTiers: [],
    burnExcess: 'no',
    gasTypeSelected: {}
  }

  async componentDidMount() {
    const { web3Store, gasPriceStore } = this.props
    await checkWeb3(web3Store.web3)

    this.setState({ loading: true })

    try {
      await gasPriceStore.updateValues()
    } catch (error) {
      noGasPriceAvailable()
    }

    const { initialTiers, burnExcess, gasTypeSelected } = await this.load()

    this.setState({
      loading: false,
      initialTiers: initialTiers,
      burnExcess: burnExcess,
      gasTypeSelected: gasTypeSelected
    })
    window.scrollTo(0, 0)
  }

  async load() {
    const { tierStore, generalStore, web3Store, crowdsaleStore, gasPriceStore } = this.props

    await sleep(1000)

    if (tierStore.tiers.length === 0) {
      logger.log('Web3store', web3Store)
      tierStore.addCrowdsale(web3Store.curAddress)
    } else {
      this.setState({
        reload: true
      })
    }

    let initialTiers

    if (crowdsaleStore.isDutchAuction) {
      initialTiers = [JSON.parse(JSON.stringify(tierStore.tiers))[0]]
    } else {
      initialTiers = JSON.parse(JSON.stringify(tierStore.tiers))
    }

    if (!generalStore.gasTypeSelected) {
      generalStore.setGasTypeSelected(gasPriceStore.gasPricesInGwei[0])
    }

    return {
      initialTiers: initialTiers,
      burnExcess: generalStore.burnExcess,
      gasTypeSelected: generalStore.gasTypeSelected
    }
  }

  goNextStep = () => {
    try {
      navigateTo({
        history: this.props.history,
        location: 'stepFour'
      })
    } catch (err) {
      logger.log('Error to navigate', err)
    }
  }

  handleOnSubmit = () => {
    const { tierStore, reservedTokenStore, deploymentStore, crowdsaleStore } = this.props
    const tiersCount = tierStore.tiers.length
    const reservedCount = reservedTokenStore.tokens.length
    const hasWhitelist = tierStore.tiers.some(tier => {
      return tier.whitelistEnabled === 'yes'
    })
    const hasMinCap = tierStore.tiers.some(tier => {
      return +tier.minCap !== 0
    })

    deploymentStore.initialize(!!reservedCount, hasWhitelist, crowdsaleStore.isDutchAuction, tierStore.tiers, hasMinCap)

    getNetworkVersion()
      .then(networkID => {
        if (getNetWorkNameById(networkID) === CHAINS.MAINNET) {
          const { generalStore } = this.props
          const priceSelected = generalStore.gasPrice
          let whitelistCount = 0

          if (hasWhitelist) {
            whitelistCount = tierStore.tiers.reduce((total, tier) => {
              if (tier.whitelist) {
                if (tier.whitelist.length) {
                  total++
                }
              }
              return total
            }, 0)
          }

          return warningOnMainnetAlert(tiersCount, priceSelected, reservedCount, whitelistCount, this.goNextStep)
        }

        this.goNextStep()
      })
      .catch(error => {
        logger.error(error)
      })
  }

  calculator = createDecorator({
    field: /.+\.endTime/,
    updates: (value, name) => {
      const nextTierIndex = +name.match(/(\d+)/)[1] + 1
      const { tierStore } = this.props
      const newValue = {}

      if (tierStore.tiers[nextTierIndex]) {
        newValue[`tiers[${nextTierIndex}].startTime`] = value
      }

      return newValue
    }
  })

  updateGasTypeSelected = value => {
    const { generalStore } = this.props
    generalStore.setGasTypeSelected(value)
  }

  render() {
    if (this.state.initialTiers.length === 0) {
      // Do not render the form until tiers are set up
      return (
        <section className="steps steps_crowdsale-contract" ref="three">
          <StepNavigation activeStep={CROWDSALE_SETUP} />
          <Loader show={this.state.loading} />
        </section>
      )
    }

    const { generalStore, tierStore, gasPriceStore, tokenStore, web3Store, crowdsaleStore } = this.props
    let stepThreeComponent = getStep3Component(crowdsaleStore.strategy)

    return (
      <div>
        <section className="lo-MenuBarAndContent" ref="three">
          <StepNavigation activeStep={CROWDSALE_SETUP} />
          <div className="st-StepContent">
            <div className="st-StepContent_Info">
              <div className="st-StepContent_InfoIcon st-StepContent_InfoIcon-step3" />
              <div className="st-StepContentInfo_InfoText">
                <h1 className="st-StepContent_InfoTitle">Crowdsale Setup</h1>
                <p className="st-StepContent_InfoDescription">
                  The most important and exciting part of the crowdsale process.<br />Here you can define parameters of
                  your crowdsale campaign.
                </p>
              </div>
            </div>
            <Form
              addCrowdsale={tierStore.addCrowdsale}
              component={stepThreeComponent}
              crowdsaleStore={crowdsaleStore}
              decimals={tokenStore.decimals}
              decorators={[this.calculator]}
              gasPricesInGwei={gasPriceStore.gasPricesInGwei}
              generalStore={generalStore}
              history={this.props.history}
              initialValues={{
                burnExcess: this.state.burnExcess,
                gasPrice: this.state.gasTypeSelected,
                tiers: this.state.initialTiers,
                walletAddress: web3Store.curAddress,
                whitelistEnabled: 'no'
              }}
              mutators={{ ...arrayMutators, setFieldTouched }}
              onSubmit={this.handleOnSubmit}
              reload={this.state.reload}
              tierStore={tierStore}
              updateGasTypeSelected={this.updateGasTypeSelected}
            />
          </div>
        </section>
        <Loader show={this.state.loading} />
      </div>
    )
  }
}
