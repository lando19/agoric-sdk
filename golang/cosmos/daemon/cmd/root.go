package cmd

import (
	"io"
	"os"
	"path/filepath"

	serverconfig "github.com/cosmos/cosmos-sdk/server/config"

	"github.com/cosmos/cosmos-sdk/baseapp"
	"github.com/cosmos/cosmos-sdk/client"
	config "github.com/cosmos/cosmos-sdk/client/config"
	"github.com/cosmos/cosmos-sdk/client/debug"
	"github.com/cosmos/cosmos-sdk/client/flags"
	"github.com/cosmos/cosmos-sdk/client/keys"
	"github.com/cosmos/cosmos-sdk/client/rpc"
	"github.com/cosmos/cosmos-sdk/codec"
	"github.com/cosmos/cosmos-sdk/server"
	servertypes "github.com/cosmos/cosmos-sdk/server/types"
	"github.com/cosmos/cosmos-sdk/snapshots"
	"github.com/cosmos/cosmos-sdk/store"
	sdk "github.com/cosmos/cosmos-sdk/types"
	authcmd "github.com/cosmos/cosmos-sdk/x/auth/client/cli"
	"github.com/cosmos/cosmos-sdk/x/auth/types"
	vestingcli "github.com/cosmos/cosmos-sdk/x/auth/vesting/client/cli"
	banktypes "github.com/cosmos/cosmos-sdk/x/bank/types"
	"github.com/cosmos/cosmos-sdk/x/crisis"
	genutilcli "github.com/cosmos/cosmos-sdk/x/genutil/client/cli"
	"github.com/spf13/cast"
	"github.com/spf13/cobra"
	tmcli "github.com/tendermint/tendermint/libs/cli"
	"github.com/tendermint/tendermint/libs/log"
	dbm "github.com/tendermint/tm-db"

	gaia "github.com/Agoric/agoric-sdk/golang/cosmos/app"
	"github.com/Agoric/agoric-sdk/golang/cosmos/app/params"
)

// Sender is a function that sends a request to the controller.
type Sender func(needReply bool, str string) (string, error)

var AppName = "agd"
var OnStartHook func(log.Logger)

// NewRootCmd creates a new root command for simd. It is called once in the
// main function.
func NewRootCmd(sender Sender) (*cobra.Command, params.EncodingConfig) {
	encodingConfig := gaia.MakeEncodingConfig()
	initClientCtx := client.Context{}.
		WithJSONCodec(encodingConfig.Marshaller).
		WithInterfaceRegistry(encodingConfig.InterfaceRegistry).
		WithTxConfig(encodingConfig.TxConfig).
		WithLegacyAmino(encodingConfig.Amino).
		WithInput(os.Stdin).
		WithAccountRetriever(types.AccountRetriever{}).
		WithHomeDir(gaia.DefaultNodeHome).
		WithViper("AGD_")

	rootCmd := &cobra.Command{
		Use:   AppName,
		Short: "Stargate Agoric App",
		PersistentPreRunE: func(cmd *cobra.Command, _ []string) error {
			// set the default command outputs
			cmd.SetOut(cmd.OutOrStdout())
			cmd.SetErr(cmd.ErrOrStderr())

			initClientCtx, err := client.ReadPersistentCommandFlags(initClientCtx, cmd.Flags())
			if err != nil {
				return err
			}

			initClientCtx, err = config.ReadFromClientConfig(initClientCtx)
			if err != nil {
				return err
			}

			if err := client.SetCmdClientContextHandler(initClientCtx, cmd); err != nil {
				return err
			}

			// Allow us to overwrite the SDK's default server config.
			srvCfg := serverconfig.DefaultConfig()
			// The SDK's default minimum gas price is set to "" (empty value) inside
			// app.toml. If left empty by validators, the node will halt on startup.
			// However, the chain developer can set a default app.toml value for their
			// validators here.
			//
			// In summary:
			// - if you leave srvCfg.MinGasPrices = "", all validators MUST tweak their
			//   own app.toml config,
			// - if you set srvCfg.MinGasPrices non-empty, validators CAN tweak their
			//   own app.toml to override, or use this default value.
			//
			// FIXME: We may want to have Agoric set a min gas price in urun.
			// For now, we set it to zero so that validators don't have to worry about it.
			srvCfg.MinGasPrices = "0urun"

			customAppTemplate := serverconfig.DefaultConfigTemplate
			customAppConfig := *srvCfg

			return server.InterceptConfigsPreRunHandler(cmd, customAppTemplate, customAppConfig)
		},
	}

	initRootCmd(sender, rootCmd, encodingConfig)

	return rootCmd, encodingConfig
}

func initRootCmd(sender Sender, rootCmd *cobra.Command, encodingConfig params.EncodingConfig) {
	cfg := sdk.GetConfig()
	cfg.Seal()

	rootCmd.AddCommand(
		genutilcli.InitCmd(gaia.ModuleBasics, gaia.DefaultNodeHome),
		genutilcli.CollectGenTxsCmd(banktypes.GenesisBalancesIterator{}, gaia.DefaultNodeHome),
		genutilcli.GenTxCmd(gaia.ModuleBasics, encodingConfig.TxConfig, banktypes.GenesisBalancesIterator{}, gaia.DefaultNodeHome),
		genutilcli.ValidateGenesisCmd(gaia.ModuleBasics),
		AddGenesisAccountCmd(gaia.DefaultNodeHome),
		tmcli.NewCompletionCmd(rootCmd, true),
		testnetCmd(gaia.ModuleBasics, banktypes.GenesisBalancesIterator{}),
		debug.Cmd(),
		config.Cmd(),
	)

	server.AddCommands(rootCmd, gaia.DefaultNodeHome, makeNewApp(sender), createSimappAndExport, addModuleInitFlags)

	// add keybase, auxiliary RPC, query, and tx child commands
	rootCmd.AddCommand(
		rpc.StatusCommand(),
		queryCommand(),
		txCommand(),
		keys.Commands(gaia.DefaultNodeHome),
	)

	// add rosetta
	rootCmd.AddCommand(server.RosettaCommand(encodingConfig.InterfaceRegistry, encodingConfig.Marshaller))
}
func addModuleInitFlags(startCmd *cobra.Command) {
	crisis.AddModuleInitFlags(startCmd)
}

func queryCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:                        "query",
		Aliases:                    []string{"q"},
		Short:                      "Querying subcommands",
		DisableFlagParsing:         true,
		SuggestionsMinimumDistance: 2,
		RunE:                       client.ValidateCmd,
	}

	cmd.AddCommand(
		authcmd.GetAccountCmd(),
		rpc.ValidatorCommand(),
		rpc.BlockCommand(),
		authcmd.QueryTxsByEventsCmd(),
		authcmd.QueryTxCmd(),
	)

	gaia.ModuleBasics.AddQueryCommands(cmd)
	cmd.PersistentFlags().String(flags.FlagChainID, "", "The network chain ID")

	return cmd
}

func txCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:                        "tx",
		Short:                      "Transactions subcommands",
		DisableFlagParsing:         true,
		SuggestionsMinimumDistance: 2,
		RunE:                       client.ValidateCmd,
	}

	cmd.AddCommand(
		authcmd.GetSignCommand(),
		authcmd.GetSignBatchCommand(),
		authcmd.GetMultiSignCommand(),
		authcmd.GetValidateSignaturesCommand(),
		flags.LineBreak,
		authcmd.GetBroadcastCommand(),
		authcmd.GetEncodeCommand(),
		authcmd.GetDecodeCommand(),
		flags.LineBreak,
		vestingcli.GetTxCmd(),
	)

	gaia.ModuleBasics.AddTxCommands(cmd)
	cmd.PersistentFlags().String(flags.FlagChainID, "", "The network chain ID")

	return cmd
}

func makeNewApp(sender Sender) func(log.Logger, dbm.DB, io.Writer, servertypes.AppOptions) servertypes.Application {
	return func(logger log.Logger, db dbm.DB, traceStore io.Writer, appOpts servertypes.AppOptions) servertypes.Application {
		if OnStartHook != nil {
			OnStartHook(logger)
		}

		var cache sdk.MultiStorePersistentCache

		if cast.ToBool(appOpts.Get(server.FlagInterBlockCache)) {
			cache = store.NewCommitKVStoreCacheManager()
		}

		skipUpgradeHeights := make(map[int64]bool)
		for _, h := range cast.ToIntSlice(appOpts.Get(server.FlagUnsafeSkipUpgrades)) {
			skipUpgradeHeights[int64(h)] = true
		}

		pruningOpts, err := server.GetPruningOptionsFromFlags(appOpts)
		if err != nil {
			panic(err)
		}

		// FIXME: Actually use the snapshotStore once we have a way to put SwingSet
		// state into it.
		var snapshotStore *snapshots.Store
		if false {
			snapshotDir := filepath.Join(cast.ToString(appOpts.Get(flags.FlagHome)), "data", "snapshots")
			snapshotDB, err := sdk.NewLevelDB("metadata", snapshotDir)
			if err != nil {
				panic(err)
			}
			snapshotStore, err = snapshots.NewStore(snapshotDB, snapshotDir)
			if err != nil {
				panic(err)
			}
		}

		return gaia.NewAgoricApp(
			sender,
			logger, db, traceStore, true, skipUpgradeHeights,
			cast.ToString(appOpts.Get(flags.FlagHome)),
			cast.ToUint(appOpts.Get(server.FlagInvCheckPeriod)),
			gaia.MakeEncodingConfig(), // Ideally, we would reuse the one created by NewRootCmd.
			appOpts,
			baseapp.SetPruning(pruningOpts),
			baseapp.SetMinGasPrices(cast.ToString(appOpts.Get(server.FlagMinGasPrices))),
			baseapp.SetMinRetainBlocks(cast.ToUint64(appOpts.Get(server.FlagMinRetainBlocks))),
			baseapp.SetHaltHeight(cast.ToUint64(appOpts.Get(server.FlagHaltHeight))),
			baseapp.SetHaltTime(cast.ToUint64(appOpts.Get(server.FlagHaltTime))),
			baseapp.SetInterBlockCache(cache),
			baseapp.SetTrace(cast.ToBool(appOpts.Get(server.FlagTrace))),
			baseapp.SetIndexEvents(cast.ToStringSlice(appOpts.Get(server.FlagIndexEvents))),
			baseapp.SetSnapshotStore(snapshotStore),
			baseapp.SetSnapshotInterval(cast.ToUint64(appOpts.Get(server.FlagStateSyncSnapshotInterval))),
			baseapp.SetSnapshotKeepRecent(cast.ToUint32(appOpts.Get(server.FlagStateSyncSnapshotKeepRecent))),
		)
	}
}

func createSimappAndExport(
	logger log.Logger, db dbm.DB, traceStore io.Writer, height int64, forZeroHeight bool, jailAllowedAddrs []string,
	appOpts servertypes.AppOptions) (servertypes.ExportedApp, error) {

	encCfg := gaia.MakeEncodingConfig() // Ideally, we would reuse the one created by NewRootCmd.
	encCfg.Marshaller = codec.NewProtoCodec(encCfg.InterfaceRegistry)
	var gaiaApp *gaia.GaiaApp
	if height != -1 {
		gaiaApp = gaia.NewGaiaApp(logger, db, traceStore, false, map[int64]bool{}, "", cast.ToUint(appOpts.Get(server.FlagInvCheckPeriod)), encCfg, appOpts)

		if err := gaiaApp.LoadHeight(height); err != nil {
			return servertypes.ExportedApp{}, err
		}
	} else {
		gaiaApp = gaia.NewGaiaApp(logger, db, traceStore, true, map[int64]bool{}, "", cast.ToUint(appOpts.Get(server.FlagInvCheckPeriod)), encCfg, appOpts)
	}

	return gaiaApp.ExportAppStateAndValidators(forZeroHeight, jailAllowedAddrs)
}
