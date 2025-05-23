"use client"
import React from 'react'
import { useEffect, useContext, useState, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCompletion } from 'ai/react';
import { useAudioRecorder } from 'react-audio-voice-recorder';
import TextTransition from 'react-text-transition';
import WebCamera from '@/components/webcam';
import { Player } from '@lottiefiles/react-lottie-player';
import controlsImage from '@/../public/controls.svg';
import { Assess, Automated_Assess } from '@prisma/client'
import { useSearchParams } from 'next/navigation';
import { DialogHeader, Dialog, DialogContent, DialogDescription, DialogTitle, DialogFooter, DialogClose, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { Focus, Info, Loader2, ScanEye, Sparkle, Sparkles, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';
import Webcam from 'react-webcam';
import { Camera, FlipHorizontal, Volume2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Slider } from './ui/slider';
import { toast } from 'sonner';
import { beep } from '../../utils/audio';

import * as cocossd from '@tensorflow-models/coco-ssd'
import '@tensorflow/tfjs-backend-cpu'
import '@tensorflow/tfjs-backend-webgl'
import { DetectedObject, ObjectDetection } from '@tensorflow-models/coco-ssd';
import {drawOnCanvas} from '@/../utils/draw'

type Props = {
  interviewInfo : Automated_Assess
}

const InterviewHosted = ({interviewInfo}: Props) => {
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [redo, setRedo] = useState(false);
  const [interviewerTalking, setInterviewerTalking] = useState(false);
  const [questionDisplay, setQuestionDisplay] = useState('');
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [modalOpen, setModalOpen] = useState(true);

  const router = useRouter();
  const speech = useRef<HTMLAudioElement | null>(null);
  const interviewerPlayer = useRef<any | null>(null);
  const ready = useRef(false);

  const [loading, setLoading] = useState(false);


  const [questions, setQuestions] = useState(
    interviewInfo.questions.map(question => ({
      question,
      answer: "",
      isAI: true,
      strengths: [], 
      improvements: [],
    }))
  );
  
  const { complete } = useCompletion({
    api: '/api/generateQues',
    onFinish: (prompt, completion) => {
      textToSpeech(completion);
    },
  });

  const parseAudio = async (blob : Blob) => {
    const res = await fetch('/api/speechToText', {
      method: 'POST',
      body: blob,
    });
    if (!res.ok) {
      console.error('API error:', res.status, res.statusText);
      return;
    }
    const text = await res.text(); // Get the raw response first
    if (!text) {
      console.error('Empty response from API');
      return;
    }

    try {
      const result = JSON.parse(text); // Parse only if there's valid text
      console.log(result, questions);
  
      const newQuestions = questions.slice();
      newQuestions[questionsAnswered]['answer'] = result.answer;
  
      setQuestions(newQuestions);
      setQuestionsAnswered(questionsAnswered + 1);
  
      console.log(result.answer);
    } catch (error) {
      console.error('Failed to parse JSON:', text);
    }
  
  };

  const askQuestion = () => {
    let requestBody: any = {};
    if (questionsAnswered == 0) {
      requestBody = {
        queryType: 'firstMessage',
        jobProfile: interviewInfo.jobProfile,
        companyName: interviewInfo.companyName,
        name: interviewInfo.name,
        question: questions[0].question,
      };
    } else if (questionsAnswered < interviewInfo.questions.length) {
      requestBody = {
        queryType: 'subsequentMessage',
        jobProfile: interviewInfo.jobProfile,
        companyName: interviewInfo.companyName,
        name: interviewInfo.name,
        question: questions[questionsAnswered].question,
        prevQuestion: questions[questionsAnswered - 1].question,
        prevAnswer: questions[questionsAnswered - 1].answer,
      };
    } else {
      requestBody = {
        queryType: 'lastMessage',
        jobProfile: interviewInfo.jobProfile,
        companyName: interviewInfo.companyName,
        name: interviewInfo.name,
        prevQuestion: questions[questionsAnswered - 1].question,
        prevAnswer: questions[questionsAnswered - 1].answer,
      };
    }
    complete(requestBody);
  };

  const textToSpeech = async (input: string) => {
    const res = await fetch('/api/textToSpeech', {
      method: 'POST',
      body: JSON.stringify({
        text: input,
      }),
    });

    const result = await res.arrayBuffer();

    const blob = new Blob([result], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);

    audio.addEventListener('ended', function () {
      setInterviewerTalking(false);
      interviewerPlayer.current.setSeeker(239, false);
      if (questionsAnswered < questions.length) {
        startRecording();
        setQuestionDisplay(questions[questionsAnswered].question);
      } else {
        setInterviewComplete(true);
      }
    });

    if (ready.current) {
      audio.play();
      interviewerPlayer.current.play();
      setInterviewerTalking(true);
    } else {
      speech.current = audio;
    }
  };

  const {
    startRecording,
    stopRecording,
    togglePauseResume,
    recordingBlob,
    isRecording,
    isPaused,
    recordingTime,
    mediaRecorder,
  } = useAudioRecorder({
    noiseSuppression: true,
    echoCancellation: true,
  });

  const redoQuestion = () => {
    setRedo(true);
    stopRecording();
  };

  useEffect(() => {
    setQuestionDisplay(
      'Welcome to your Interview, ' + interviewInfo.name.replace(/ .*/, '')
    );
  }, []);

  useEffect(() => {
    if (!recordingBlob) {
      return;
    }

    if (redo) {
      setRedo(false);
      startRecording();
      return;
    }

    parseAudio(recordingBlob);
  }, [recordingBlob]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      askQuestion();
    }, 1000); 
  
    return () => clearTimeout(timeoutId); 
  }, [questionsAnswered]);
  
  
  function delay(time : number) {
    return new Promise((resolve) => setTimeout(resolve, time));
  }

  const onSubmit = async () => {
    try {
        setLoading(true);
        console.log("reached the submission area")
        console.log(questions)
        const response1 = await fetch("/api/generateQues", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: {
              queryType: "overall",
              jobProfile: interviewInfo.jobProfile,
              companyName: interviewInfo.companyName,
              jobtype: interviewInfo.jobtype,
              jobRequirements: interviewInfo.jobRequirements,
              questions: questions,
            },
          }),
        });
        const response2 = questions.map((q) => {
          return fetch("/api/generateQues", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              prompt: {
                queryType: "feedback",
                jobProfile: interviewInfo.jobProfile,
                companyName: interviewInfo.companyName,
                jobtype: interviewInfo.jobtype,
                jobRequirements: interviewInfo.jobRequirements,
                questions: [{
                  question: q.question,
                  answer: q.answer,
                }],
              },
            }),
          });
        });
        // Promise.all to wait for all fetch requests to complete
        const response2Promise = await Promise.all(response2);
        const response3 = await fetch("/api/generateQues", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: {
              queryType: "generateAnalytics",
              jobProfile: interviewInfo.jobProfile,
              companyName: interviewInfo.companyName,
              jobtype: interviewInfo.jobtype,
              jobRequirements: interviewInfo.jobRequirements,
              questions: questions.map((q) => ({
                question: q.question,
                answer: q.answer,
              })),
            },
          }),
        });
        console.log(response1.ok)
        response2.forEach(async (res, index) => {
          const response = await res; // Await the promise to get the actual Response
          console.log(`Response for question ${index + 1}:`, response.ok);
        });        
        console.log(response3.ok)
        const overallData = await response1.json();
        const feedbackData = await Promise.all(response2.map(async (resPromise) => {
          const res = await resPromise;
          return await res.json();
        }));        
        const analyticsData = await response3.json();
        console.log(overallData)
        console.log(feedbackData)
        console.log(analyticsData)

        const combinedQuestions = questions.map((question, index) => ({
          ...question,
          ...feedbackData[index],
        }));

        const response = await fetch('/api/feedbackStoreHosted', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: interviewInfo.name,
            jobProfile: interviewInfo.jobProfile,
            companyName: interviewInfo.companyName,
            jobtype: interviewInfo.jobtype,
            jobRequirements: interviewInfo.jobRequirements,
            questions: combinedQuestions,
            level: interviewInfo.level,
            overview: overallData.feedback, // Assuming 'feedback' contains the overview string
            analytics: analyticsData.interviewFeedbackAnalyticsRadar,
          }),
        });        
        if (response.ok) {
          console.log("Request was successful!");
          await new Promise(resolve => setTimeout(resolve, 1000));
          const responseData = await response.json();
          console.log("Response:", responseData);
        
          const { automated_Results } = responseData;
          const { id } = automated_Results;
          
          if (id) {
            console.log("Extracted id:", id);
            router.push(`/feedbackHosted?id=${id}`);
          } else {
            console.error("Error: Unable to extract id from the response.");
          }
        } else {
          console.error("Request failed with status:", response.status);
        }
      } catch (error) {
      console.error('Error submitting interview data:', error);
      console.error(error);
      alert("Error submitting interview data.");
    } finally {
      setLoading(false); // Set loading to false when the submission completes (either success or failure)
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    ready.current = true;
  
    if (speech.current !== null) {
      delay(1000).then(() => {
        speech.current?.play();
        if (interviewerPlayer.current !== null) {
          interviewerPlayer.current?.play();
          setInterviewerTalking(true);
        }
      });
    }
  };

  // webcam functionalities

  let interval : any = null;
  let stopTimeOut : any = null;

  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [mirriored, setMirrored] = useState<boolean>(true)
  const [isRec, setIsRec] = useState<boolean>(false)
  const [autoRec, setAutoRec] = useState<boolean>(true)
  const [volume, setVolume] = useState(0.8);
  const [model, setModel] = useState<ObjectDetection>();
  const [loadin, setLoadin] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(()=>{
    if(webcamRef && webcamRef.current){
      const stream = (webcamRef.current.video as any).captureStream();
      if(stream){
        mediaRecorderRef.current = new MediaRecorder(stream);
        mediaRecorderRef.current.ondataavailable = (event) => {
          if(event.data.size > 0){
            const recordedBlob = new Blob([event.data], {type:'video'});
            const videoUrl = URL.createObjectURL(recordedBlob);
            const action = document.createElement('a');
            action.href = videoUrl;
            action.download =  `${formatData(new Date())}.webm`;
            action.click();
          }
        };
        mediaRecorderRef.current.onstart = (event) => {
          setIsRec(true);
        }
        mediaRecorderRef.current.onstop = (event) => {
          setIsRec(false);
        }
      }
    }
  },[])

  useEffect(()=>{
    setLoadin(true);
    initModel();
  },[])

  async function initModel(){
    const loadedModel: ObjectDetection = await cocossd.load({
      base: 'mobilenet_v2'
    });
    setModel(loadedModel)
  }

  useEffect(()=>{
    if(model){
      setLoadin(false);
    }
  },[model])

  // 0 : have nothing, 1 : have metadata, 2 : have current data, 3 : have future data, 4 : have enough data
  async function runPrediction(){
    if(model && webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
      const predictions: DetectedObject[] = await model.detect(webcamRef.current.video)
      // console.log(predictions)
      resizeCanvas(canvasRef, webcamRef);
      drawOnCanvas(mirriored, predictions, canvasRef.current?.getContext('2d'));

      let isPerson: boolean = false;

      if(predictions.length > 0){
        predictions.forEach((prediction)=>{
          isPerson = (prediction.class === 'person');
        })
        console.log(isPerson)
        console.log(autoRec)
        if(isPerson && autoRec){
          startRecordin(true);
        }
      }
    }
  }

  useEffect(()=>{
    interval = setInterval(()=>{
      runPrediction()
    },100)
    return ()=> clearInterval(interval)
  },[webcamRef.current, model, mirriored, autoRec])

  return (
      <>
        {loadin && 
        <div className='z-50 shadow-md shadow-black absolute bottom-5 right-5 p-4 rounded-lg flex items-center justify-center bg-gradient-to-tl from-violet-400 to-violet-300 dark:bg-gradient-to-br dark:from-gray-900 dark:via-purple-900 dark:to-violet-600'>
          Proctoring Model is Loading <Loader2 className="animate-spin ml-2 w-5 h-5 text-white" />
        </div>
       }
        <div className='p-8 flex flex-col max-w-6xl mx-auto'>
        {loading ? (
          <div className="fixed top-0 left-0 w-full h-full bg-gradient-to-tl from-violet-400 to-violet-300 dark:bg-gradient-to-br dark:from-gray-900 dark:via-purple-900 dark:to-violet-600 bg-opacity-75 flex items-center justify-center">
            <p className="text-white text-5xl">Submitting...</p>
          </div>
        ):(
          <div className='flex flex-col'>
            <div className="flex bg-secondary mx-6 mt-6 items-center rounded-3xl p-4">
            <div className="max-w-full max-h-120px flex flex-col-reverse">
              <div className="w-20vw border-b-0.5rem border-tl-gradient"></div>
              <h5 className="font-bold text-3xl">
                <span className="transition text-primary">{questionDisplay}</span>
              </h5>
            </div>
            <div className="ml-auto bg-gradient-tr-bl rounded-l-md flex items-center justify-center h-3rem w-10.45rem">
              <p className='p-3 whitespace-nowrap px-4 mr-3 font-semibold shadow-sm shadow-black border-none bg-gradient-to-tl from-pink-400 via-purple-400 to-indigo-500 text-white rounded-xl'>{interviewInfo.questions.length - questionsAnswered} {interviewInfo.questions.length - questionsAnswered === 1 ? 'question' : 'questions'} left</p>
              <Dialog open={modalOpen}>
            <DialogTrigger asChild className='p-3 px-4 font-semibold shadow-md shadow-black border-none bg-gradient-to-tl from-pink-400 via-purple-400 to-indigo-500 text-white rounded-xl h-12'>
              <Button className=''><Info className=''/></Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle className='text-2xl'>Welcome To Your Virtual Interview Style Assessment</DialogTitle>
              <DialogHeader>
                <div className='flex flex-col gap-2'>
                  <p>Once the interview starts, the interviewer will begin by welcoming
                  you and asking you the first question. Here are some tips for the
                  best interview experience:
                  </p>
                  <ul className="list-disc pl-6">
                    <li>Ensure you are in an environment with minimal background noise.</li>
                    <li>Talk clearly at a regular pace in the direction of your microphone.</li>
                    <li>Answer the questions appropriately and stay on topic.</li>
                  </ul>
                  <p>Best of luck! We'll see you afterwards with your feedback.</p>
                </div>
              </DialogHeader> 
              <DialogFooter>
                <DialogClose>
                  <Button className={'p-5 shadow-md shadow-black border-none bg-gradient-to-br from-violet-300 to-violet-500 text-white rounded-xl'} onClick={closeModal}>
                      Let's Begin
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
              </Dialog>
            </div>
              </div>
              <div className='rounded-lg flex justify-center flex-row p-6 px-0 gap-6'>
                <div className='bg-secondary relative rounded-3xl p-6 flex flex-col justify-center items-center'>
                  <Player loop src='/Speech.json' className='w-80' ref={interviewerPlayer} speed={1.25}></Player>
                  <Button className='absolute bottom-6 left-6 p-3 px-4 font-semibold shadow-sm shadow-black border-none bg-gradient-to-tl from-pink-400 via-purple-400 to-indigo-500 text-white rounded-xl'>AI Interviewer</Button>
                </div>
                <div className='relative'>
                  <div>
                    <Webcam
                      ref={webcamRef}
                      mirrored={mirriored}
                      style={{ width: '100%', height: '100%', borderRadius: '1rem' }}
                      audio={false}
                    />
                    <canvas ref={canvasRef} className='absolute top-0 left-0 h-full w-full object-contain'></canvas>
                  </div>
                  <Button className={cn('absolute top-6 right-6 p-3 px-4 font-semibold shadow-sm shadow-black border-none bg-gradient-to-tl from-pink-400 via-purple-400 to-indigo-500 text-white rounded-xl', { hidden: interviewerPlayer ? '' : 'hidden' })}>
                    {interviewerTalking ? 'Please wait for the Interviewer to finish speaking' : 'You may answer the question now'}
                  </Button>
                  <Button className='absolute bottom-6 left-6 p-3 px-4 font-semibold shadow-sm shadow-black border-none bg-gradient-to-tl from-pink-400 via-purple-400 to-indigo-500 text-white rounded-xl'>
                    {interviewInfo.name}
                  </Button>
                </div>
              </div>
              <div className="flex flex-row justify-between w-full">
                <div className="mt-4 ml-6 gap-4 flex flex-row">
                  <Button className='p-5 shadow-md shadow-black border-none bg-gradient-to-r text-white rounded-xl from-rose-700 to-pink-600'  onClick={redoQuestion}>
                    Redo
                  </Button>
                  <Button type='submit' className='p-5 shadow-md shadow-black border-none bg-gradient-to-r text-white rounded-xl from-teal-700 to-teal-600'  onClick={interviewComplete ? () => onSubmit : stopRecording}>
                    {questionsAnswered == interviewInfo.questions.length ? 'Next Question' : 'Submit Answer'}
                  </Button>
                  <Button className='p-5 shadow-md shadow-black border-none bg-gradient-to-r text-white rounded-xl from-purple-700 to-pink-400' onClick={onSubmit} type='submit'>
                    {questionsAnswered == interviewInfo.questions.length ? 'End Interview' : 'End Interview'}
                  </Button>
                  <div className='flex flex-row gap-4'>
                    <Button className='p-5 shadow-md shadow-black border-none bg-gradient-to-r from-violet-500 to-violet-300 text-white rounded-xl' onClick={() => {setMirrored((prev) => !prev)}}><FlipHorizontal className='w-5 h-5'/></Button>
                    <Button className='p-5 shadow-md shadow-black border-none bg-gradient-to-r from-violet-500 to-violet-300 text-white rounded-xl' onClick={userPromptScreenshot}><Camera className='w-5 h-5'/></Button>
                    <Button className={cn('p-5 shadow-md shadow-black border-none bg-gradient-to-br from-rose-700 to-pink-600 text-white rounded-xl')} onClick={userPromptRecorder}>
                      {!isRec ? <Video /> : <Focus/>}
                    </Button>
                    <Button className={cn('p-5 shadow-md shadow-black border-none bg-gradient-to-br from-rose-700 to-pink-600 text-white rounded-xl')} onClick={toggleAutoRecord}>
                      {!autoRec ? <Sparkle /> : <Sparkles/>}
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button className='p-5 shadow-md shadow-black border-none bg-gradient-to-r from-violet-500 to-violet-300 text-white rounded-xl' >
                          <Volume2 className='w-5 h-5' />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className='p-6 shadow-md shadow-black border-none bg-gradient-to-r from-violet-500 to-violet-300 text-white rounded-xl'>
                        <Slider
                          max={1}
                          min={0}
                          step={0.2}
                          defaultValue={[volume]}
                          onValueCommit={(val) => {
                            setVolume(val[0]);
                            beep(val[0])
                          }}
                          className='cursor-pointer'
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
          </div>
        )}
        </div>
      </>
      
  );
  
  function userPromptScreenshot(){
    if(!webcamRef.current){
      toast('Camera is not found. Please Refresh')
    }
    else{
      const imgSrc = webcamRef.current.getScreenshot();
      console.log(imgSrc);
      const blob = base64toBlob(imgSrc);
      const url = URL.createObjectURL(blob);
      const action = document.createElement('a');
      action.href = url;
      action.download = `${formatData(new Date())}.png`
      action.click();
    }
  }

  function userPromptRecorder(){
    if(!webcamRef.current){
      toast('Camera is not found. Please Refresh')
    }
    if(mediaRecorderRef.current?.state == 'recording'){
      mediaRecorderRef.current.requestData();
      clearTimeout(stopTimeOut);
      mediaRecorderRef.current.stop();
      toast('Recording saved to downloads');
    } else {
      startRecordin(false);
    }
  }

  function startRecordin(dobeep: boolean){
    if(webcamRef.current && mediaRecorderRef.current?.state !== 'recording'){
      mediaRecorderRef.current?.start();
      dobeep && beep(volume);
      stopTimeOut = setTimeout(()=>{
        if(mediaRecorderRef.current?.state === 'recording'){
          mediaRecorderRef.current.requestData();
          mediaRecorderRef.current.stop();
        }
      }, 30000)
    }
  }

  function toggleAutoRecord(){
    if(autoRec){
      setAutoRec(false)
      toast('Autorecord Disabled')
    } else {
      setAutoRec(true)
      toast('Autorecord Enabled')
    }
  }

}

export default InterviewHosted

// types already defined
function resizeCanvas(canvasRef: React.RefObject<HTMLCanvasElement>, webcamRef: React.RefObject<Webcam>) {
  const canvas = canvasRef.current;
  const video = webcamRef.current?.video;

  if((canvas && video)){
    const {videoWidth, videoHeight} = video
    canvas.width = videoWidth;
    canvas.height = videoHeight;
  }
}

function formatData(date: Date){
  const formattedDate =
  [
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
    date.getFullYear(),
  ]
    .join("-") +
  " " +
  [
    date.getHours().toString().padStart(2, "0"),
    date.getMinutes().toString().padStart(2, "0"),
    date.getSeconds().toString().padStart(2, "0"),
  ].join("-");
  return formattedDate;
}

function base64toBlob(base64Data: any) {
  const byteCharacters = atob(base64Data.split(",")[1]);
  const arrayBuffer = new ArrayBuffer(byteCharacters.length);
  const byteArray = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }

  return new Blob([arrayBuffer], { type: "image/png" }); // Specify the image type here
}