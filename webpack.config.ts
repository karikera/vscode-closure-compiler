
import webpack = require('webpack');

const out:webpack.Configuration = {
    mode: "none",
    devtool: 'source-map',
    entry: {
        index: "./src/index.ts",
        tool_help_to_schema: "./src/tools/help_to_schema.ts",
    },
    target: "node",
    output: {
        filename: "./[name].js",
        libraryTarget: "commonjs2",
        
		devtoolFallbackModuleFilenameTemplate: '[absolute-resource-path]',
		devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            }
        ]
    },
    resolve: {
      extensions: [ '.tsx', '.ts', '.js' ],
    },
    externals: {
        'vscode': 'commonjs vscode',
        'google-closure-compiler-java': 'commonjs google-closure-compiler-java',
        'typescript': 'commonjs typescript'
    }
};

export = out;
