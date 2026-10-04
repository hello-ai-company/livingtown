// Test-only renderer replacement: real React UI, no external tiles or WebGL assets.
export const sceneFixture = `
export const GSI_SEAMLESSPHOTO_URL = 'https://example.invalid/test-imagery';
export async function createNavaraScene(input) {
 const label=document.createElement('p');label.textContent='3D UI TEST — 模擬描画 / 外部3D資産未検証';label.style='padding:24px;color:#fff;background:#183a48;font-size:14px';input.container.append(label);
 const diagnostics={renderer:'WebGL2',readiness:'ready',terrain:'ready',imagery:'seamlessphoto',plateau:'ready',plateauMunicipality:'中央区',plateauSwitchState:'idle',plateauAttributionUrl:'https://example.invalid/plateau',weather:{mode:input.weatherMode||'clear'},quality:input.quality,fps:30};
 input.onStatus(diagnostics);
 return {diagnostics,setCamera(){},update(v){diagnostics.weather={mode:v.weatherMode||'clear'};input.onStatus({...diagnostics});},async flyTo(){return true;},dispose(){label.remove();}};
}`;
