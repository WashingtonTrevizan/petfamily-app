import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Screen = 
  | 'splash' 
  | 'login' 
  | 'register' 
  | 'family-select' 
  | 'create-family' 
  | 'join-family' 
  | 'ranking' 
  | 'notifications'
  | 'pets' 
  | 'tasks' 
  | 'family-profile' 
  | 'edit-pet' 
  | 'edit-profile';

export interface Pet {
  id: string;
  name: string;
  type: 'dog' | 'cat' | 'bird' | 'other';
  breed: string;
  age: string;
  status: 'healthy' | 'vaccine-due';
  image: string;
  clinicalNotes?: string;
  owners: string[];
}

export interface FamilyMember {
  id: string;
  name: string;
  role: 'admin' | 'member';
  points: number;
  tasksCompleted: number;
  avatar: string;
}

export interface Task {
  id: string;
  title: string;
  time: string;
  day: 'today' | 'tomorrow';
  assignedTo?: string;
  petName: string;
  completed: boolean;
}

export interface Activity {
  id: string;
  userName: string;
  action: string;
  petName: string;
  time: string;
  points: number;
  type: 'food' | 'walk' | 'medicine' | 'bath';
}
