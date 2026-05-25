import { useRef, useEffect, useState } from 'react';
import {
  EventNames,
  RealtimeAPIError,
  RealtimeClient,
  RealtimeError,
  RealtimeUtils,
} from '@coze/realtime-api';
import { Dialog, Mask, SpinLoading, DotLoading   } from 'antd-mobile';
import { AudioOutline, AudioMutedOutline, PhoneFill, MoreOutline, MinusCircleOutline } from 'antd-mobile-icons'
// 按需引入微信js-sdk核心对象
import wx from 'weixin-js-sdk'
// 引入css样式
import "./home.css"

import request from './utils/request';

function Home(){
  // 获取微信小程序带过来的参数
  const [miniToWebParam, setMiniToWebParam] = useState<any>(null);
  // 获取背景
  const [webBackground, setWebBackground] = useState<string>('');

  const clientRef = useRef<RealtimeClient | null>(null);
  // 是否正在连接
  const [isConnecting, setIsConnecting] = useState(false);
  // 是否开启麦克风
  const [audioEnabled, setAudioEnabled] = useState(true);
  // 当前每分钟消耗的资源点数
  const currentMinuteCostPoint = useRef(0)
  // 计算剩余点数
  const balanceRef = useRef(0)
  // 聊天室状态 
  // 0 正在听...(静态，此时用户尚未说话) 
  // 1 正在听...(动态，此时用户正在说话)  + (用户说完话等待智能体回复)
  // 2 说话或点击打断 (静态，此时智能体正在说话) 
  const [conversationStatus, setConversationStatus] = useState<number>(0)

  // 获取当前页面的 URL
  const urlParams = new URLSearchParams(window.location.search);
  // 获取 miniToWebParam 参数并解析为 JSON 对象
  const fromWebParam = urlParams.get('miniToWebParam');
  // 定时器
  const [running, setRunning] = useState(false);
  const countRef = useRef(0); // 计数器
  const timerRef = useRef<any>(null); // 定时器引用

  useEffect(() => {
    if(fromWebParam){
        try {
            const paramObject = JSON.parse(fromWebParam);
            setMiniToWebParam(paramObject);
            // 获取智能体类型
            const agentType = paramObject.currentInfo.agentType
            // 获取背景
            const background = paramObject.currentInfo.avatar;

            if(agentType === 1){
              // 自建智能体 直接用静态头像
              setWebBackground(background)
            }else{
              // 平台智能体 用服务器上的rtc资源gif动图做头像 如果找不到相应的gif 就用它的avatar
              const rtcBackground = convertImageUrl(background)
              fetch(rtcBackground, { method: 'HEAD' }) // 只获取响应头，节省流量
              .then(response => {
                  if (response.ok) {
                      console.log(`文件存在，状态码: ${response.status}`);
                      setWebBackground(rtcBackground)
                  } else if (response.status === 404) {
                      console.log(`文件不存在(404)`);
                      setWebBackground(background)
                  } else {
                      // 处理其他状态码，如500、403、502等
                      console.log(`无法确定，状态码: ${response.status}`);
                      setWebBackground(background)
                  }
              })
              .catch(error => {
                  // 网络错误或被跨域策略阻止
                  console.error('检查失败(可能跨域或网络问题):', error);
                  setWebBackground(background)
              });
              
            }
            
            // 获取剩余点数
            balanceRef.current = paramObject.balance
            // 存储token
            localStorage.setItem("token",paramObject.token)
        } catch (error) {
            console.error('参数解析失败:', error);
        }
    }

    // 清理函数：在组件卸载时关闭房间
    return () => {
      clientRef.current?.disconnect();
      clientRef.current?.clearEventHandlers();
      clientRef.current = null;
    }; 
  }, [ fromWebParam ]);

  useEffect(() => {
    
    const onVisibilityChange = () => {
      if (document.hidden) {
        // 退出房间
        clientRef.current?.disconnect();
        clientRef.current?.clearEventHandlers();
        clientRef.current = null;
        // 关闭定时器
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      }else{
        setVisible(true)
        // 更新资源点 以兼容充值资源点后返回来
        request.post('/wallet/query', {})
        .then(res => {
            balanceRef.current = res.data.balance
        })
        .catch(err => console.error(err));
      }
    }
  
    document.addEventListener('visibilitychange', onVisibilityChange)
  
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      // 页面卸载时清理定时器
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  }, [])

  async function initClient() {
    const checkVideo = false; // 如需申请摄像头权限，请设置为 true
    const permission = await RealtimeUtils.checkDevicePermission(checkVideo);
    
    if (!permission.audio) {
      throw new Error('需要麦克风访问权限');
    }

    // 获取botId
    let { botId } = miniToWebParam.currentInfo;
    // 获取userId
    let { userId } = miniToWebParam;
    // 获取conversationId
    let { conversationId } = miniToWebParam;
    // 获取voiceId
    let { voiceId } = miniToWebParam.currentInfo;

    request.post('/agent/rtc/config', {})
    .then(res => {
      currentMinuteCostPoint.current = res.data.rtc_m_cost;

      const client = new RealtimeClient({
        accessToken: res.data.rtc_pat,
        botId:botId,
        userId:userId,
        conversationId:conversationId,
        connectorId: '1024',
        voiceId: voiceId,
        allowPersonalAccessTokenInBrowser: true, // 可选：允许在浏览器中使用个人访问令牌
        debug: true,
      });
  
      clientRef.current = client;
  
      handleMessageEvent();
    })
    .catch(err => console.error(err));
    
  }

  const handleMessageEvent = async () => {
    let { prefix } = miniToWebParam;
    prefix = prefix.replace(/\n/g, '');
    clientRef.current?.on(EventNames.ALL, (eventName, event: any) => {
      // 智能体加入房间
      if(eventName == 'server.bot.join'){
        // 1. 发送上行事件 更新房间配置
        clientRef.current?.sendMessage({
          "id": "7474840061251747877",
          "event_type": "session.update",
          "data": {
            "chat_config":{
              "meta_data": JSON.parse(prefix),
              "custom_variables": JSON.parse(prefix),
              "extra_params": JSON.parse(prefix),
              "parameters":JSON.parse(prefix)
            }
          }
        });
        // 2. 开始计时扣费
        if (running) return; // 避免重复开启
        setRunning(true);
        countRef.current = 0;
        timerRef.current = setInterval(() => {
          countRef.current += 1;
          // 每60次的第一次请求（第1,61,121,...次）
          if ((countRef.current - 1) % 60 === 0) {
            // 判断剩余资源点是否大于每分钟消耗的资源点  大于每分钟消耗的资源点请求接口扣除每分钟消耗的资源点 并且将缓存中的资源点数减去每分钟消耗的
            if(balanceRef.current >= currentMinuteCostPoint.current){
              let { id } = miniToWebParam.currentInfo;
              request.post('/wallet/consume/rtc/minutes', {
                agent_id:id
              })
              .then(res => {
                  balanceRef.current = res.data.balance
              })
              .catch(err => console.error(err));
            }else{
              // 关掉实时语音通话
              clientRef.current?.disconnect();
              clientRef.current?.clearEventHandlers();
              clientRef.current = null;
              // 清除定时器
              setRunning(false);
              if (timerRef.current) {
                clearInterval(timerRef.current);
              }
              let { tel } = miniToWebParam;
              if( tel ){
                Dialog.alert({
                  content: '感谢您的支持！您的模型资源点剩余不足，请充值购买资源点后继续使用，谢谢！',
                  confirmText:"去充值",
                  onConfirm: async () => {
                    wx.miniProgram.navigateTo({
                      url:'/pages/buyDiamonds/buyDiamonds'
                    })
                  },
                })
              }else{
                Dialog.alert({
                  content: '感谢您的支持！您在游客模式下的体验资源点剩余不足，请点击“一键注册登录”成为绑定用户，免费获赠15天会员权益，和额外资源点！',
                  confirmText:"一键注册登录",
                  onConfirm: async () => {
                    wx.miniProgram.navigateTo({
                      url:'/pages/index/index'
                    })
                  },
                })
              }
            }
          }
        }, 1000);
      }
      // 用户开始说话
      if(eventName == 'server.audio.user.speech_started'){
        setConversationStatus(1)
      }
      // 智能体开始说话
      if(eventName == 'server.audio.agent.speech_started'){
        setConversationStatus(2)
      }
      // 智能体说话结束了
      if(eventName == 'server.audio.agent.speech_stopped'){
        setConversationStatus(0)
      }
      // 拿到聊天记录并提交
      if (
        eventName == "server.conversation.message.completed" && (event.data.type == "question" || event.data.type == "answer")
      ) {
        let { id } = miniToWebParam.currentInfo;
        let { roleId } = miniToWebParam;
        let obj = {
          agent_id:id,
          role_id:roleId,
          conversation_id:event.data.conversation_id,
          bot_id:event.data.bot_id,
          character:event.data.role == "user" ? "user" : "agent",
          chat_id:event.data.chat_id,
          content:event.data.content
        }
        request.post('/conversation/chat/history/save', obj)
        .then(res => {
          if(!res.data){
            Dialog.alert({
              content: "聊天记录上传失败",
              closeOnMaskClick: true,
            })
          }
        })
        .catch(err => console.error(err));
      }
      // 检测到用户连续三分钟没有说话 提示用户退出
      if(eventName == "server.error" && event.data.code == 4029){
        Dialog.alert({
          content: "检测到您已经连续三分钟没有说过话，5s后将为您关闭当前通话模式",
          closeOnMaskClick: true,
        })
        setTimeout(() => {
          handleDisconnect()
        },5000)
      }
    });
  };

  const handleConnect = async () => {
    try {
      if (!clientRef.current) {
        await initClient();
      }
      await clientRef.current?.connect();
    } catch (error) {
      if (error instanceof RealtimeAPIError) {
        switch (error.code) {
          case RealtimeError.CREATE_ROOM_ERROR:
            Dialog.alert({
              content: `创建房间失败: ${error.message}`
            })
            break;
          case RealtimeError.CONNECTION_ERROR:
            Dialog.alert({
              content: `加入房间失败: ${error.message}`
            })
            break;
          case RealtimeError.DEVICE_ACCESS_ERROR:
            Dialog.alert({
              content: `获取设备失败: ${error.message}`
            })
            break;
          default:
            Dialog.alert({
              content: `连接错误: ${error.message}`
            })
        }
      } else {
        Dialog.alert({
          content: `连接错误： ${error}`
        })
      }
    }
  };

  const handleInterrupt = () => {
    try {
      clientRef.current?.interrupt();
      setConversationStatus(0)
    } catch (error) {
      Dialog.alert({
        content: `打断失败：${error}`
      })
    }
  };

  const handleDisconnect = () => {
    try {
      // 关掉实时语音通话
      clientRef.current?.disconnect();
      clientRef.current?.clearEventHandlers();
      clientRef.current = null;
      // 清除定时器
      setRunning(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      wx.miniProgram.navigateBack({
        delta:1
      } as any)
    } catch (error) {
      Dialog.alert({
        content: `断开失败：${error}`
      })
    }
  };

  const toggleMicrophone = async () => {
    try {
      await clientRef.current?.setAudioEnable(!audioEnabled);
      setAudioEnabled(!audioEnabled);
    } catch (error) {
      Dialog.alert({
        content: `切换麦克风状态失败： ${error}`
      })
    }
  };

  // 处理rtc头像地址
  const convertImageUrl = (url:string) => {
    // 找到最后一个"/"的索引位置
    const lastSlashIndex = url.lastIndexOf('/');
    // 提取前缀（包含最后一个"/"）和文件名
    const urlPrefix = url.slice(0, lastSlashIndex + 1);
    const newUrlPrefix = urlPrefix.replace("avatar_background","rtc_avatar_background")
    const fileName = url.slice(lastSlashIndex + 1);
    // 关键：正则匹配.png 或 .jpg，统一替换为.gif
    const newFileName = fileName.replace(/\.(png|jpg)$/, '.GIF');
    // 重新拼接URL
    return newUrlPrefix + newFileName;
  }

  // 显示loading
  const [visible, setVisible] = useState(true)  

  const RenderByValue = (a:any) => {
    
    // 定义值和对应渲染内容的映射关系
    const renderMap = {
      0: <div className="listening"><MoreOutline fontSize={48} color='#333'/><div style={{textAlign:'center', fontSize: 14}}>正在听</div></div>,
      1: <div className="thinking"><div style={{ color: '#333', fontSize: 28 }}><DotLoading color='currentColor'/><div style={{ textAlign:'center', fontSize: 14 }}>思考中</div></div></div>,
      2: <div className="speaking" style={{textAlign:'center'}}><MinusCircleOutline fontSize={28} color='#333' onClick={handleInterrupt}/><div style={{textAlign:'center', fontSize: 14}}>说话或点击可打断</div></div>
    };
  
    // 根据a的值获取对应的渲染内容，没有则显示默认内容
    return <>{renderMap[a as 0 | 1 | 2] || <div className="default"></div>}</>;
  }

  return (
    <div id='webview'>
        <Mask visible={visible} className='maskLoading' opacity='thick'>
            {
                isConnecting ? (
                    <span style={{ fontSize: 24 }}>
                        <SpinLoading  style={{ '--size': '48px' }} color='white'/>
                    </span>
                ) : (
                    <div className="enterRoom" onClick={() => {
                        setIsConnecting(true);
                        handleConnect().finally(() => {
                            setIsConnecting(false);
                            setVisible(false);
                        });
                    }}>
                        <PhoneFill fontSize={48} color='#fff'/>
                    </div>
                )
            }  
        </Mask>
        <img src={webBackground} className="webViewBackground"/>
        <div className='webViewAction'>
            <div className="soundMute" onClick={toggleMicrophone}>
                {
                    audioEnabled ? (
                        <AudioOutline fontSize={48} color='#fff'/>
                    ) : (
                        <AudioMutedOutline fontSize={48} color='#fff'/>
                    )
                }
            </div>
            <div className='chatStatus'>
                {
                  RenderByValue(conversationStatus)
                }
            </div>
            <div className="exitRoom" onClick={handleDisconnect}>
                <PhoneFill fontSize={45} color='#fff'/>
            </div>
        </div>
    </div>
  );
};

export default Home;
