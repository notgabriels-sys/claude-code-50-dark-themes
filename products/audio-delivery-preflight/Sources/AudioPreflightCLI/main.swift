import Darwin
import Dispatch
import Foundation

Task {
    let code = await CLI().run(arguments: Array(CommandLine.arguments.dropFirst()))
    exit(code)
}

dispatchMain()
