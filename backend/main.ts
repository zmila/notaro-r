// procsy backend — shells out to ps/lsof (macOS) or PowerShell (Windows) and
// exposes the results as api calls.
const dec = new TextDecoder();

// txiki has no tjs.platform — key everything off the OS env var.
const IS_WIN = tjs.env.OS === 'Windows_NT';

const enc = new TextEncoder();

function parseJsonRows(out: string): any[] {
  const t = out.trim();
  if (!t) return [];
  const data = JSON.parse(t);
  return Array.isArray(data) ? data : [data];
}

// ── Windows PowerShell worker ──────────────────────────────────────────────
// One cold PowerShell spawn per api call (~1s startup) plus a full perf-counter
// sweep was hammering the box every refresh. Instead we run ONE long-lived
// PowerShell process, spawned lazily on the first Windows call and reused. It
// loops on stdin: 'p' → process table, 'n' → listening TCP ports, 's' → sysinfo
// — one compact JSON line each; 'q'/EOF exits. Being persistent lets it compute
// %CPU from its own Kernel+UserModeTime deltas (no perf-counter class) and cache
// memBytes/ncpu, which never change.
const WORKER_SCRIPT = [
  "$ProgressPreference='SilentlyContinue'",
  "$ErrorActionPreference='SilentlyContinue'",
  "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
  "$prev=@{}",                 // pid -> previous (kernel+user) 100ns ticks
  "$prevT=$null",              // timestamp of previous 'p' sample
  "$total=$null",              // cached total physical memory (bytes)
  "$ncpu=[double]$env:NUMBER_OF_PROCESSORS",
  "$lastOverall=0.0",          // overall CPU% from the last 'p' sample
  "function Emit($o){if($null -eq $o){[Console]::Out.WriteLine('[]');[Console]::Out.Flush();return};$j=ConvertTo-Json -Compress -Depth 3 -InputObject $o;if([string]::IsNullOrEmpty($j)){$j='[]'};[Console]::Out.WriteLine($j);[Console]::Out.Flush()}",
  "while($true){",
  "$line=[Console]::In.ReadLine()",
  "if($null -eq $line){break}",
  "$cmd=$line.Trim()",
  "if($cmd -eq 'q'){break}",
  "elseif($cmd -eq 'p'){",
  "if($null -eq $total){$total=[double](Get-CimInstance Win32_ComputerSystem -Property TotalPhysicalMemory).TotalPhysicalMemory}",
  "$now=[DateTime]::Now",
  "$elapsed=0.0;if($prevT){$elapsed=($now-$prevT).TotalSeconds}",
  "$cur=@{}",
  "$sum=0.0",
  "$rows=Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize,Name,ExecutablePath,CreationDate,KernelModeTime,UserModeTime|ForEach-Object{",
  "$id=[int]$_.ProcessId",
  "if($id -eq 0){return}",     // skip System Idle Process (would read as ~100% busy)
  "$ticks=[double]$_.KernelModeTime+[double]$_.UserModeTime",
  "$cur[$id]=$ticks",
  "$cpu=0.0",
  "if($elapsed -gt 0 -and $prev.ContainsKey($id)){$dt=$ticks-$prev[$id];if($dt -gt 0){$sum+=$dt;$cpu=[math]::Round($dt/1e7/$elapsed*100,1)}}",
  "$ws=[double]$_.WorkingSetSize",
  "$mem=0.0;if($total -gt 0){$mem=[math]::Round($ws/$total*100,1)}",
  "$et=''",
  "if($_.CreationDate){$sp=$now-$_.CreationDate;$dd=$sp.Days;$h=$sp.Hours;$m=$sp.Minutes;$s=$sp.Seconds;if($dd -gt 0){$et='{0}-{1:00}:{2:00}:{3:00}'-f$dd,$h,$m,$s}elseif($h -gt 0){$et='{0}:{1:00}:{2:00}'-f$h,$m,$s}else{$et='{0:00}:{1:00}'-f$m,$s}}",
  "$path='';if($_.ExecutablePath){$path=$_.ExecutablePath}",
  "[pscustomobject]@{pid=$id;ppid=[int]$_.ParentProcessId;cpu=$cpu;mem=$mem;rss=[long]($ws/1024);user='';etime=$et;name=$_.Name;path=$path}",
  "}",
  "if($elapsed -gt 0 -and $ncpu -gt 0){$lastOverall=[math]::Round($sum/1e7/$elapsed/$ncpu*100,1)}",
  "$prev=$cur;$prevT=$now",
  "Emit @($rows)",
  "}",
  "elseif($cmd -eq 'n'){",
  "$names=@{};Get-Process|ForEach-Object{$names[$_.Id]=$_.ProcessName}",
  "$rows=Get-NetTCPConnection -State Listen|ForEach-Object{$op=[int]$_.OwningProcess;$c='';if($names.ContainsKey($op)){$c=$names[$op]};[pscustomobject]@{pid=$op;command=$c;user='';proto='TCP';address=[string]$_.LocalAddress;port=[int]$_.LocalPort}}",
  "Emit @($rows)",
  "}",
  "elseif($cmd -eq 's'){",
  "if($null -eq $total){$total=[double](Get-CimInstance Win32_ComputerSystem -Property TotalPhysicalMemory).TotalPhysicalMemory}",
  "Emit ([pscustomobject]@{memBytes=[long]$total;ncpu=[int]$ncpu;cpu=[double]$lastOverall})",
  "}",
  "}",
].join('\n');

interface Worker { proc: any; reader: any; writer: any; buf: string; dead: boolean }
let worker: Worker | null = null;
let queue: Promise<unknown> = Promise.resolve();


export interface Hello {
  name: string;
  time: string;
}


async function sayHello(name: string): Promise<Hello> {
  return { name: name || "world", time: new Date().toLocaleTimeString() };
}


export const api: Record<string, TinyApiHandler> = {
  hello: async ({ name }: { name: string }) => sayHello(name)
};

export function init(_app: TinyApp) {
  (_app as any).setMenu([{ title: 'Help', items: [] }]);
  // (_app as any).setMenu([{ title: 'Help', items: [{ id: 'check-updates', label: 'Check for Updates…' }] }]);
}


export function onMenu() {
}
