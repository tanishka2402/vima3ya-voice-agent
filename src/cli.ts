import readline from 'readline';
import { MenuService } from './menuService';
import { Orchestrator } from './orchestrator';
import { transcribe, synthesize } from './io';

const SCRIPT_1 = [
  "Hi, what's on the menu?",
  "Can you recommend something?",
  "Is the tikka masala spicy?",
  "I'll have the tikka masala and two fries",
  "Actually make it three fries",
  "Add a coke",
  "What's my order so far?",
];

const SCRIPT_2 = [
  "Do you have anything vegan?",
  "I'd like the mutton rogan josh",
  "Ok give me the vegan buddha bowl instead",
  "Actually cancel the fries, add a coke instead",
  "Remove the buddha bowl, make it two cokes",
  "That's all, confirm my order",
];

function runScripted(label: string, script: string[]) {
  const orchestrator = new Orchestrator(new MenuService());
  console.log(`\n===== ${label} =====\n`);
  for (const line of script) {
    const heard = transcribe({ raw: line });
    console.log(`User: ${heard}`);
    const turn = orchestrator.processTurn(heard);
    const audio = synthesize(turn.responseText);
    console.log(`Agent: ${turn.responseText}`);
    console.log(`  (tool calls: ${turn.toolCalls.map((t) => t.name).join(', ') || 'none'})`);
    void audio;
    console.log('');
  }
}

function runInteractive() {
  const orchestrator = new Orchestrator(new MenuService());
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("Steward Agent ready. Type your order (Ctrl+C to quit).\n");

  const prompt = () => rl.question('You: ', (line) => {
    const heard = transcribe({ raw: line });
    const turn = orchestrator.processTurn(heard);
    const audio = synthesize(turn.responseText);
    console.log(`Agent: ${audio.raw.replace('[TTS AUDIO]: ', '')}\n`);
    prompt();
  });
  prompt();
}

const args = process.argv.slice(2);
if (args.includes('--script')) {
  runScripted('Sample Conversation 1', SCRIPT_1);
  runScripted('Sample Conversation 2', SCRIPT_2);
} else {
  runInteractive();
}
