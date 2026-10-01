import { describe, expect, it, vi } from 'vitest'
import { LocalTownRepository } from '../data/supabase'
import { getToolDefinitions } from './tools'
import { createAgentGateway } from './agentGateway'
import type { TownRepository } from '../data/repository'
const conditions = { household_id: 'h-wheelchair', scenario: 'flood', weather: 'rain', time_of_day: 'day' }
function setup() {
  const store = new LocalTownRepository({ persist: false }); const gate = createAgentGateway(); const phase = new AbortController()
  gate.bind('drill', store, phase.signal)
  const tool = getToolDefinitions('drill', store).find(t => t.name === 'get_evacuation_route')!
  const inspect = async () => (await gate.execute(tool, { inspect: true }, phase.signal) as any).state
  const request = async (id = 'request-0001') => ({ request_id: id, expected_revision: (await inspect()).revision, input: conditions })
  return { store, gate, phase, tool, inspect, request }
}
describe('native agent approval boundary', () => {
  it('discovers stable IDs/evidence and never mutates on inspection or proposal; one confirmed operation is replayable', async () => {
    const { store, gate, phase, tool, inspect, request } = setup(); const before = JSON.stringify(store.getSnapshot())
    const state = await inspect(); expect(state.households[0].id).toBeTruthy(); expect(state.evidence[0].updated_at).toBeTruthy(); expect(state.live_ai).toBe(false)
    const envelope = await request(); await gate.execute(tool, envelope, phase.signal); await gate.execute(tool, envelope, phase.signal)
    expect(JSON.stringify(store.getSnapshot())).toBe(before)
    await Promise.all([gate.approve(envelope.request_id), gate.approve(envelope.request_id)])
    const result = await gate.execute(tool, envelope, phase.signal) as any
    expect(result.request.basis.revision).toBe(envelope.expected_revision);expect(result.request.basis.evidence[0].updated_at).toBeTruthy();expect(result.request.status).toBe('completed'); expect(result.request.result).toEqual(store.getSnapshot().routes['h-wheelchair'])
    const count = store.getSnapshot().events.length; await gate.execute(tool, envelope, phase.signal); expect(store.getSnapshot().events).toHaveLength(count)
    expect((await gate.execute(tool, { ...envelope, input: { ...conditions, weather: 'clear' } }, phase.signal) as any).error.code).toBe('REQUEST_CONFLICT')
  })
  it('rejects stale revisions, state/UI changes, cancellation, expiry and phase changes before committing', async () => {
    const { store, gate, phase, tool, request } = setup(); const first = await request()
    await gate.execute(tool, first, phase.signal); gate.invalidate(); await gate.approve(first.request_id); expect(store.getSnapshot().routes).toEqual({})
    expect((await gate.execute(tool, { ...first, request_id:'request-stale' }, phase.signal) as any).error.code).toBe('STALE_STATE')
    const second = await request('request-second'); await gate.execute(tool, second, phase.signal)
    store.registerHousehold({ constraints: [], start_lat: 35.681, start_lng: 139.76 }); await gate.approve(second.request_id); expect(gate.getSnapshot()?.status).toBe('stale')
    const third = await request('request-third'); await gate.execute(tool, third, phase.signal); gate.cancel(third.request_id); await gate.approve(third.request_id); expect(store.getSnapshot().routes).toEqual({})
    const expired = await request('request-expired'); await gate.execute(tool, expired, phase.signal)
    const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+121000); await gate.approve(expired.request_id); clock.mockRestore(); expect(gate.getSnapshot()?.status).toBe('stale')
    const last=await request('request-phase');await gate.execute(tool,last,phase.signal);phase.abort();gate.bind('map',store,new AbortController().signal);await gate.approve(last.request_id);expect(store.getSnapshot().routes).toEqual({})
  })
  it('rejects unconfirmed raw calls, malformed/extra input and duplicate or concurrent new requests', async () => {
    const { gate,phase,tool,request }=setup()
    expect((await gate.execute(tool,conditions,phase.signal) as any).error.code).toBe('INVALID_INPUT')
    const valid=await request()
    for(const input of [{...conditions,confirmed:true},{...conditions,scenario:'fire'},null]) expect((await gate.execute(tool,{...valid,input},phase.signal) as any).error.code).toBe('INVALID_INPUT')
    await gate.execute(tool,valid,phase.signal);expect((await gate.execute(tool,{...valid,request_id:'request-busy'},phase.signal) as any).error.code).toBe('BUSY')
  })
  it('blocks all shared writes and human verification even with valid envelopes', async () => {
    const {store,gate,phase,tool,request}=setup();const envelope=await request()
    const verify=getToolDefinitions('map',store).find(t=>t.name==='verify_knowledge')!
    expect((await gate.execute(verify,envelope,phase.signal) as any).error.code).toBe('HUMAN_VERIFICATION_ONLY')
    const shared=Object.create(store) as TownRepository;Object.defineProperty(shared,'dataMode',{value:'SUPABASE_SHARED'})
    gate.bind('drill',shared,phase.signal);expect((await gate.execute(tool,envelope,phase.signal) as any).error.code).toBe('SHARED_MUTATION_DISABLED')
  })
  it('keeps ambiguous failures terminal rather than retrying the mutation', async () => {
    const { gate,phase,tool,request }=setup();const run=vi.fn().mockRejectedValue(new Error('secret detail'))
    const broken={...tool,run};const envelope=await request();await gate.execute(broken,envelope,phase.signal);await gate.approve(envelope.request_id)
    const result=await gate.execute(broken,envelope,phase.signal);await gate.approve(envelope.request_id)
    expect(JSON.stringify(result)).not.toContain('secret detail');expect((result as any).request.status).toBe('unconfirmed');expect(run).toHaveBeenCalledTimes(1)
  })
})

it('uses the existing login boundary again at approval, and keeps reads free of persistence side effects', async () => {
  const store=new LocalTownRepository({persist:false});let allowed=true
  const gate=createAgentGateway(()=>{if(!allowed)throw Error('expired')});const signal=new AbortController().signal
  gate.bind('map',store,signal);const query=getToolDefinitions('map',store).find(t=>t.name==='query_area')!
  const before=JSON.stringify(store.getSnapshot());await gate.execute(query,{lat:35.681,lng:139.76,radius_m:500},signal);expect(JSON.stringify(store.getSnapshot())).toBe(before)
  gate.bind('replay',store,signal);const summary=getToolDefinitions('replay',store).find(t=>t.name==='get_debrief_summary')!;await gate.execute(summary,{},signal);expect(JSON.stringify(store.getSnapshot())).toBe(before)
  gate.bind('drill',store,signal);const tool=getToolDefinitions('drill',store).find(t=>t.name==='get_evacuation_route')!;const state=(await gate.execute(tool,{inspect:true},signal) as any).state
  await gate.execute(tool,{request_id:'expires-before-approval',expected_revision:state.revision,input:conditions},signal);allowed=false;await gate.approve('expires-before-approval')
  expect(gate.getSnapshot()?.status).toBe('authorization_required');expect(store.getSnapshot().routes).toEqual({})
})

it('gates every remaining mutation and reuses domain validation before asking the person', async () => {
  const samples=[['map','contribute_knowledge',{category:'accessibility',lat:35.681,lng:139.76,condition:'always',description:'訓練サンプル',confidence:'experienced'}],['drill','register_household',{constraints:[],start_lat:35.681,start_lng:139.76}],['drill','report_bottleneck',{lat:35.681,lng:139.76,severity:1}],['replay','control_replay',{action:'overview'}]] as const
  for(const [phase,name,input] of samples){
    const store=new LocalTownRepository({persist:false});const gate=createAgentGateway();const signal=new AbortController().signal;gate.bind(phase,store,signal)
    const tool=getToolDefinitions(phase,store).find(t=>t.name===name)!;const before=JSON.stringify(store.getSnapshot());const state=(await gate.execute(tool,{inspect:true},signal) as any).state
    const envelope={request_id:'operation-example',expected_revision:state.revision,input};expect((await gate.execute(tool,envelope,signal) as any).request.status).toBe('awaiting_confirmation');expect(JSON.stringify(store.getSnapshot())).toBe(before)
    await gate.approve(envelope.request_id);expect((await gate.execute(tool,envelope,signal) as any).request.status).toBe('completed')
  }
  const {gate,phase,store,inspect}=setup();const tool=getToolDefinitions('drill',store).find(t=>t.name==='register_household')!
  expect((await gate.execute(tool,{request_id:'outside-demo-area',expected_revision:(await inspect()).revision,input:{constraints:[],start_lat:90,start_lng:0}},phase.signal) as any).error.code).toBe('INVALID_INPUT')
})
