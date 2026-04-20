import { Pet, FamilyMember, Task, Activity } from './types';

export const MOCK_PETS: Pet[] = [
  {
    id: '1',
    name: 'Bolinha',
    type: 'dog',
    breed: 'Golden Retriever',
    age: '3 years old',
    status: 'healthy',
    image: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&q=80&w=800',
    owners: ['1', '2']
  },
  {
    id: '2',
    name: 'Mimi',
    type: 'cat',
    breed: 'Persian Cat',
    age: '5 years old',
    status: 'vaccine-due',
    image: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&q=80&w=800',
    owners: ['1']
  },
  {
    id: '3',
    name: 'Max',
    type: 'dog',
    breed: 'Beagle',
    age: '1 year old',
    status: 'healthy',
    image: 'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?auto=format&fit=crop&q=80&w=800',
    owners: ['3']
  }
];

export const MOCK_MEMBERS: FamilyMember[] = [
  {
    id: '1',
    name: 'Ana',
    role: 'admin',
    points: 2500,
    tasksCompleted: 45,
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200'
  },
  {
    id: '2',
    name: 'Carlos',
    role: 'member',
    points: 2150,
    tasksCompleted: 38,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200'
  },
  {
    id: '3',
    name: 'Júlia',
    role: 'member',
    points: 1890,
    tasksCompleted: 32,
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=200'
  },
  {
    id: '4',
    name: 'Roberto',
    role: 'member',
    points: 1420,
    tasksCompleted: 12,
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200'
  },
  {
    id: '5',
    name: 'Carla',
    role: 'member',
    points: 980,
    tasksCompleted: 8,
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200'
  }
];

export const MOCK_TASKS: Task[] = [
  {
    id: '1',
    title: 'Café da Manhã',
    time: '08:00',
    day: 'today',
    assignedTo: 'Carlos',
    petName: 'Max',
    completed: false
  },
  {
    id: '2',
    title: 'Passeio no Parque',
    time: '14:30',
    day: 'today',
    assignedTo: 'Ana',
    petName: 'Bolinha',
    completed: false
  },
  {
    id: '3',
    title: 'Remédio de Verme',
    time: '19:00',
    day: 'tomorrow',
    petName: 'Mimi',
    completed: false
  }
];

export const MOCK_ACTIVITIES: Activity[] = [
  {
    id: '1',
    userName: 'Ana',
    action: 'alimentou',
    petName: 'Bolinha',
    time: 'Há 5 minutos',
    points: 10,
    type: 'food'
  },
  {
    id: '2',
    userName: 'Carlos',
    action: 'passeou com',
    petName: 'Max',
    time: 'Há 2 horas',
    points: 25,
    type: 'walk'
  },
  {
    id: '3',
    userName: 'Júlia',
    action: 'deu remédio para',
    petName: 'Luna',
    time: 'Há 4 horas',
    points: 15,
    type: 'medicine'
  }
];
